#include <Arduino.h>

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7735.h>

#include "secrets.h"

#define TFT_CS 5
#define TFT_RST 21
#define TFT_SCK 18
#define TFT_A0 19
#define TFT_SDA 23
#define TFT_MISO 2

#define AUDIO_PIN 25

namespace {

Adafruit_ST7735 tft(TFT_CS, TFT_A0, TFT_RST);

constexpr bool USE_INSECURE_TLS_FOR_DEV = true;
constexpr char ROOT_CA[] = "";

constexpr unsigned long WIFI_RETRY_MS = 500;
constexpr unsigned long REMINDER_POLL_MS = 30UL * 1000UL;
constexpr unsigned long SUMMARY_REFRESH_MS = 5UL * 60UL * 1000UL;
constexpr unsigned long SCHEDULE_REFRESH_MS = 15UL * 60UL * 1000UL;

unsigned long lastReminderPollAt = 0;
unsigned long lastSummaryRefreshAt = 0;
unsigned long lastScheduleRefreshAt = 0;
bool waterReminderActive = false;

String serverTimeUtc;
int scheduleIntervalMinutes = 0;
float dailyGoalLiters = 0.0f;
float totalIntakeLiters = 0.0f;
String nextReminderAt;
String reminderTitle;
String reminderMessage;
String reminderAnimation;

bool isHttpsUrl(const String &url) {
  return url.startsWith("https://");
}

void drawStatus(const String &line1, const String &line2 = "", uint16_t bg = ST77XX_WHITE, uint16_t fg = ST77XX_BLACK) {
  tft.fillScreen(bg);
  tft.setTextWrap(true);
  tft.setTextColor(fg);
  tft.setCursor(4, 8);
  tft.setTextSize(1);
  tft.println(line1);
  if (line2.length() > 0) {
    tft.println();
    tft.println(line2);
  }
}

void setReminderTone(bool enabled) {
  if (enabled) {
    ledcWriteTone(AUDIO_PIN, 1800);
    ledcWrite(AUDIO_PIN, 128);
  } else {
    ledcWriteTone(AUDIO_PIN, 0);
    ledcWrite(AUDIO_PIN, 0);
  }
}

void ensureWifiConnected() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  drawStatus("Connecting WiFi", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    delay(WIFI_RETRY_MS);
    Serial.print('.');
  }

  Serial.println();
  Serial.print("WiFi connected. IP: ");
  Serial.println(WiFi.localIP());
  drawStatus("WiFi connected", WiFi.localIP().toString());
}

void configureSecureClient(WiFiClientSecure &client, const String &url) {
  if (!isHttpsUrl(url)) {
    return;
  }

  if (!USE_INSECURE_TLS_FOR_DEV && strlen(ROOT_CA) > 0) {
    client.setCACert(ROOT_CA);
    return;
  }

  client.setInsecure();
}

bool sendRequest(
    const String &method,
    const String &url,
    JsonDocument *responseDoc,
    int &statusCode,
    const char *jsonBody = nullptr) {
  ensureWifiConnected();

  WiFiClientSecure client;
  configureSecureClient(client, url);

  HTTPClient http;
  if (!http.begin(client, url)) {
    Serial.println("HTTPClient begin failed");
    return false;
  }

  http.setTimeout(10000);
  http.addHeader("Accept", "application/json");
  if (jsonBody != nullptr) {
    http.addHeader("Content-Type", "application/json");
  }

  if (method == "GET") {
    statusCode = http.GET();
  } else if (method == "POST") {
    statusCode = http.POST(reinterpret_cast<const uint8_t *>(jsonBody), strlen(jsonBody));
  } else {
    http.end();
    Serial.println("Unsupported HTTP method");
    return false;
  }

  String payload;
  if (statusCode > 0) {
    payload = http.getString();
  }
  http.end();

  Serial.printf("%s %s -> %d\n", method.c_str(), url.c_str(), statusCode);
  if (statusCode <= 0) {
    Serial.println("HTTP request failed before response");
    return false;
  }

  if (responseDoc == nullptr || payload.isEmpty()) {
    return true;
  }

  DeserializationError error = deserializeJson(*responseDoc, payload);
  if (error) {
    Serial.print("JSON parse failed: ");
    Serial.println(error.c_str());
    Serial.println(payload);
    return false;
  }

  return true;
}

String buildWaterUrl(const String &pathAndQuery) {
  String url(API_BASE_URL);
  url += pathAndQuery;
  return url;
}

bool fetchWaterSchedule() {
  StaticJsonDocument<512> doc;
  int statusCode = 0;
  String url = buildWaterUrl("/api/water/schedule?user_id=" + String(WATER_USER_ID));

  if (!sendRequest("GET", url, &doc, statusCode)) {
    return false;
  }

  if (statusCode != 200) {
    Serial.println("Schedule fetch returned non-200");
    return false;
  }

  scheduleIntervalMinutes = doc["interval_min"] | 0;
  dailyGoalLiters = doc["daily_goal_liters"] | dailyGoalLiters;

  const char *startTime = doc["start_time"] | "";
  const char *endTime = doc["end_time"] | "";

  Serial.printf(
      "Water schedule: every %d min, window %s-%s, goal %.2f L\n",
      scheduleIntervalMinutes,
      startTime,
      endTime,
      dailyGoalLiters);

  drawStatus("Water schedule synced", String(startTime) + "-" + String(endTime));
  return true;
}

bool fetchWaterSummary() {
  StaticJsonDocument<2048> doc;
  int statusCode = 0;
  String url = buildWaterUrl("/api/water/summary?user_id=" + String(WATER_USER_ID));

  if (!sendRequest("GET", url, &doc, statusCode)) {
    return false;
  }

  if (statusCode != 200) {
    Serial.println("Summary fetch returned non-200");
    return false;
  }

  JsonObject today = doc["today"];
  totalIntakeLiters = today["total_intake_liters"] | 0.0f;
  dailyGoalLiters = today["goal_liters"] | dailyGoalLiters;
  nextReminderAt = String(today["next_reminder_at"] | "");

  Serial.printf("Water summary: %.2f / %.2f L\n", totalIntakeLiters, dailyGoalLiters);

  char line2[32];
  snprintf(line2, sizeof(line2), "%.2f / %.2f L", totalIntakeLiters, dailyGoalLiters);
  drawStatus("Hydration today", line2);
  return true;
}

bool acknowledgeWaterReminder() {
  StaticJsonDocument<256> requestDoc;
  requestDoc["user_id"] = WATER_USER_ID;

  char body[96];
  size_t bodyLen = serializeJson(requestDoc, body, sizeof(body));
  if (bodyLen == 0 || bodyLen >= sizeof(body)) {
    Serial.println("Ack body serialization failed");
    return false;
  }

  int statusCode = 0;
  String url = buildWaterUrl("/api/water/ack");
  if (!sendRequest("POST", url, nullptr, statusCode, body)) {
    return false;
  }

  if (statusCode != 200) {
    Serial.println("Ack returned non-200");
    return false;
  }

  Serial.println("Reminder acknowledged");
  return true;
}

bool postWaterIntake(int amountMl) {
  StaticJsonDocument<256> requestDoc;
  requestDoc["user_id"] = WATER_USER_ID;
  requestDoc["amount_ml"] = amountMl;
  requestDoc["source"] = "esp32";

  char body[128];
  size_t bodyLen = serializeJson(requestDoc, body, sizeof(body));
  if (bodyLen == 0 || bodyLen >= sizeof(body)) {
    Serial.println("Intake body serialization failed");
    return false;
  }

  StaticJsonDocument<768> responseDoc;
  int statusCode = 0;
  String url = buildWaterUrl("/api/water/intake");

  if (!sendRequest("POST", url, &responseDoc, statusCode, body)) {
    return false;
  }

  if (statusCode != 201) {
    Serial.println("Intake log returned unexpected status");
    return false;
  }

  JsonObject today = responseDoc["summary"]["today"];
  totalIntakeLiters = today["total_intake_liters"] | totalIntakeLiters;
  dailyGoalLiters = today["goal_liters"] | dailyGoalLiters;

  Serial.printf("Logged intake: %d mL, total now %.2f L\n", amountMl, totalIntakeLiters);
  return true;
}

bool pollWaterReminder() {
  StaticJsonDocument<1024> doc;
  int statusCode = 0;
  String url = buildWaterUrl("/api/water/poll?user_id=" + String(WATER_USER_ID));

  if (!sendRequest("GET", url, &doc, statusCode)) {
    return false;
  }

  if (statusCode != 200) {
    Serial.println("Reminder poll returned non-200");
    return false;
  }

  serverTimeUtc = String(doc["server_time_utc"] | "");
  bool remindNow = doc["remind_now"] | false;
  const char *reason = doc["reason"] | "unknown";

  Serial.printf("Reminder poll: remind_now=%s reason=%s\n", remindNow ? "true" : "false", reason);

  if (!remindNow) {
    if (waterReminderActive) {
      waterReminderActive = false;
      setReminderTone(false);
      drawStatus("Water reminder cleared", reason);
    }
    return true;
  }

  JsonObject payload = doc["payload"];
  reminderTitle = String(payload["title"] | "Drink water");
  reminderMessage = String(payload["message"] | "Time to hydrate!");
  reminderAnimation = String(payload["animation"] | "");

  waterReminderActive = true;
  setReminderTone(true);
  drawStatus(reminderTitle, reminderMessage, ST77XX_BLUE, ST77XX_WHITE);

  Serial.printf("Reminder animation: %s\n", reminderAnimation.c_str());

  acknowledgeWaterReminder();
  return true;
}

void initializeScreenAndAudio() {
  SPI.begin(TFT_SCK, TFT_MISO, TFT_SDA, TFT_CS);

  tft.initR(INITR_GREENTAB);
  tft.setRotation(0);
  tft.fillScreen(ST77XX_BLACK);
  delay(250);
  drawStatus("Booting ESP32", "Preparing network");

  ledcAttach(AUDIO_PIN, 2000, 8);
  setReminderTone(false);
}

}  // namespace

void setup() {
  Serial.begin(115200);
  delay(250);

  initializeScreenAndAudio();
  ensureWifiConnected();

  fetchWaterSchedule();
  fetchWaterSummary();
  pollWaterReminder();

  lastReminderPollAt = millis();
  lastSummaryRefreshAt = millis();
  lastScheduleRefreshAt = millis();
}

void loop() {
  ensureWifiConnected();

  unsigned long now = millis();

  if (now - lastReminderPollAt >= REMINDER_POLL_MS) {
    pollWaterReminder();
    lastReminderPollAt = now;
  }

  if (now - lastSummaryRefreshAt >= SUMMARY_REFRESH_MS) {
    fetchWaterSummary();
    lastSummaryRefreshAt = now;
  }

  if (now - lastScheduleRefreshAt >= SCHEDULE_REFRESH_MS) {
    fetchWaterSchedule();
    lastScheduleRefreshAt = now;
  }

  if (Serial.available()) {
    String command = Serial.readStringUntil('\n');
    command.trim();

    if (command.equalsIgnoreCase("drink")) {
      postWaterIntake(250);
      fetchWaterSummary();
    } else if (command.equalsIgnoreCase("summary")) {
      fetchWaterSummary();
    } else if (command.equalsIgnoreCase("schedule")) {
      fetchWaterSchedule();
    } else if (command.equalsIgnoreCase("poll")) {
      pollWaterReminder();
    }
  }

  delay(50);
}
