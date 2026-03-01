#include <Arduino.h>

#include <WiFi.h>
#include "esp_eap_client.h"
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7735.h>

#include "secrets.h"

#if defined(__has_include)
#if __has_include("pet_sprite.h")
#include "pet_sprite.h"
#define HAS_PET_SPRITE 1
#else
#define HAS_PET_SPRITE 0
#endif
#else
#define HAS_PET_SPRITE 0
#endif

#define TFT_CS  5
#define TFT_RST 4
#define TFT_A0  2
#define TFT_SDA 23
#define TFT_SDK 18
Adafruit_ST7735 tft = Adafruit_ST7735(TFT_CS, TFT_A0, TFT_RST);

#define AUDIO_PIN 25

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
uint8_t waterPercent = 0;
uint8_t stressPercent = 0;
String nextReminderAt;
String reminderTitle;
String reminderMessage;
String reminderAnimation;

constexpr uint16_t COLOR_SKY = ST77XX_CYAN;
constexpr uint16_t COLOR_MIST = 0xBE18;
constexpr uint16_t COLOR_TREE_DARK = 0x1A63;
constexpr uint16_t COLOR_TREE_MID = 0x2C85;
constexpr uint16_t COLOR_GRASS = 0x0586;
constexpr uint16_t COLOR_DIRT = 0x8A22;
constexpr uint16_t COLOR_STONE = 0x7BEF;
constexpr uint16_t COLOR_PANEL = 0x39C7;
constexpr uint16_t COLOR_EMPTY_BAR = 0x49A5;
constexpr uint16_t COLOR_WATER_BAR = 0x5DDF;
constexpr uint16_t COLOR_STRESS_BAR = 0xFEC0;
constexpr uint16_t COLOR_CAT_WHITE = ST77XX_WHITE;
constexpr uint16_t COLOR_CAT_ORANGE = 0xFC40;
constexpr uint16_t COLOR_CAT_BLACK = ST77XX_BLACK;
constexpr uint16_t COLOR_SPROUT = 0x05E6;

uint8_t clampPercent(int value) {
  if (value < 0) {
    return 0;
  }
  if (value > 100) {
    return 100;
  }
  return static_cast<uint8_t>(value);
}

void fillPixelBlock(int16_t x, int16_t y, int16_t scale, uint16_t color) {
  tft.fillRect(x, y, scale, scale, color);
}

void drawTree(int16_t x, int16_t trunkY, int16_t canopySize, uint16_t canopyColor) {
  tft.fillRect(x + (canopySize / 2) - 2, trunkY, 4, 12, COLOR_DIRT);
  tft.fillRect(x, trunkY - canopySize, canopySize, canopySize, canopyColor);
}

void drawStressIcon(int16_t x, int16_t y, uint16_t color) {
  tft.drawCircle(x + 4, y + 4, 3, color);
  tft.drawFastHLine(x, y + 4, 9, color);
  tft.drawFastVLine(x + 4, y, 9, color);
}

void drawWaterIcon(int16_t x, int16_t y, uint16_t color) {
  tft.drawPixel(x + 3, y, color);
  tft.drawFastVLine(x + 2, y + 1, 5, color);
  tft.drawFastVLine(x + 4, y + 1, 5, color);
  tft.drawFastHLine(x + 1, y + 2, 5, color);
  tft.drawFastHLine(x + 1, y + 5, 5, color);
  tft.drawPixel(x + 1, y + 3, color);
  tft.drawPixel(x + 5, y + 3, color);
  tft.drawPixel(x + 1, y + 4, color);
  tft.drawPixel(x + 5, y + 4, color);
}

void drawHudBar(int16_t x, int16_t y, int16_t w, int16_t h, uint8_t percent, uint16_t fillColor) {
  tft.drawRect(x, y, w, h, ST77XX_BLACK);
  tft.fillRect(x + 1, y + 1, w - 2, h - 2, COLOR_EMPTY_BAR);
  int fillWidth = ((w - 2) * percent) / 100;
  if (fillWidth > 0) {
    tft.fillRect(x + 1, y + 1, fillWidth, h - 2, fillColor);
  }
}

void drawHudPanel() {
  tft.fillRect(0, 0, 128, 24, COLOR_PANEL);
  tft.drawFastHLine(0, 24, 128, ST77XX_BLACK);

  tft.setTextWrap(false);
  tft.setTextSize(1);
  tft.setTextColor(ST77XX_BLACK, COLOR_PANEL);

  drawStressIcon(3, 8, ST77XX_BLACK);
  tft.setCursor(14, 2);
  tft.print("STRESS");
  drawHudBar(14, 12, 40, 8, stressPercent, COLOR_STRESS_BAR);

  tft.setCursor(74, 2);
  tft.print("WATER");
  drawHudBar(72, 12, 40, 8, waterPercent, COLOR_WATER_BAR);
  drawWaterIcon(117, 8, ST77XX_BLUE);
}

void drawBackground() {
  tft.fillScreen(COLOR_MIST);

  for (int x = 0; x < 128; x += 18) {
    drawTree(x, 70, 18, COLOR_TREE_DARK);
  }
  for (int x = 9; x < 128; x += 20) {
    drawTree(x, 84, 16, COLOR_TREE_MID);
  }

  tft.fillRect(0, 112, 128, 16, COLOR_DIRT);
  for (int x = 0; x < 128; x += 8) {
    tft.drawFastVLine(x, 107 + (x % 3), 5, COLOR_GRASS);
  }
  tft.fillRect(26, 100, 76, 14, COLOR_DIRT);
  tft.fillRect(34, 105, 5, 3, COLOR_STONE);
  tft.fillRect(90, 103, 6, 4, COLOR_STONE);
}

void drawCatSprite(int16_t x, int16_t y, int16_t scale) {
  static const char *rows[] = {
      "....WWWW....",
      "...WWWWWW...",
      "..WOWWWWBW..",
      "..WWWWWWWW..",
      ".WWKWWWWKWW.",
      ".WWWWWWWWWW.",
      ".WOWWWWWWBW.",
      ".WWWWWWWWWW.",
      "..WWWWWWWW..",
      "..WOO..BBW..",
      "..WWW..WWW..",
      ".WWW....WWW.",
      ".WW......WW.",
  };

  const int rowCount = sizeof(rows) / sizeof(rows[0]);
  const int colCount = 12;

  for (int row = 0; row < rowCount; ++row) {
    for (int col = 0; col < colCount; ++col) {
      char pixel = rows[row][col];
      uint16_t color = 0;
      bool shouldDraw = true;

      switch (pixel) {
        case 'W':
          color = COLOR_CAT_WHITE;
          break;
        case 'O':
          color = COLOR_CAT_ORANGE;
          break;
        case 'B':
          color = COLOR_CAT_BLACK;
          break;
        case 'K':
          color = COLOR_TREE_DARK;
          break;
        default:
          shouldDraw = false;
          break;
      }

      if (shouldDraw) {
        fillPixelBlock(x + (col * scale), y + (row * scale), scale, color);
      }
    }
  }

  tft.fillRect(x + (5 * scale), y - (2 * scale), 2 * scale, 2 * scale, COLOR_SPROUT);
  tft.fillRect(x + (4 * scale), y - (3 * scale), 2 * scale, scale, COLOR_SPROUT);
  tft.fillRect(x + (6 * scale), y - (4 * scale), 2 * scale, scale, COLOR_SPROUT);
  tft.fillRect(x + (5 * scale), y - scale, scale, scale, COLOR_TREE_DARK);
}

void drawPetArt() {
#if HAS_PET_SPRITE
  const int16_t safeWidth = PET_SPRITE_WIDTH > 128 ? 128 : PET_SPRITE_WIDTH;
  const int16_t safeHeight = PET_SPRITE_HEIGHT > 80 ? 80 : PET_SPRITE_HEIGHT;
  const int16_t spriteX = (128 - safeWidth) / 2;
  const int16_t spriteY = 32;
  tft.drawRGBBitmap(
      spriteX,
      spriteY,
      const_cast<uint16_t *>(PET_SPRITE_DATA),
      safeWidth,
      safeHeight);
#else
  drawCatSprite(46, 56, 3);
#endif
}

void drawFooterText() {
  tft.setTextWrap(false);
  tft.setTextSize(1);
  tft.setTextColor(ST77XX_BLACK, COLOR_DIRT);
  tft.fillRect(0, 116, 128, 12, COLOR_DIRT);
  tft.setCursor(4, 118);
  if (waterReminderActive) {
    tft.print("Hydrate now");
  } else {
    tft.print("Water ");
    tft.print(waterPercent);
    tft.print("%  Stress ");
    tft.print(stressPercent);
    tft.print("%");
  }
}

void renderForestUi() {
  drawBackground();
  drawHudPanel();
  drawPetArt();
  drawFooterText();

  if (waterReminderActive) {
    tft.fillRect(12, 30, 104, 18, ST77XX_BLUE);
    tft.drawRect(12, 30, 104, 18, ST77XX_WHITE);
    tft.setTextColor(ST77XX_WHITE, ST77XX_BLUE);
    tft.setTextWrap(false);
    tft.setCursor(18, 36);
    tft.print("TIME TO HYDRATE!");
  }
}

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

    WiFi.disconnect(true);
    WiFi.mode(WIFI_STA);
    delay(100);

    drawStatus("Connecting WiFi", WIFI_SSID);

    esp_eap_client_set_identity((uint8_t*)WIFI_USERNAME, strlen(WIFI_USERNAME));
    esp_eap_client_set_username((uint8_t*)WIFI_USERNAME, strlen(WIFI_USERNAME));
    esp_eap_client_set_password((uint8_t*)WIFI_PASSWORD, strlen(WIFI_PASSWORD));

    esp_wifi_sta_enterprise_enable();

    WiFi.begin(WIFI_SSID);

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

template <typename TClient>
bool sendRequestWithClient(
    TClient &client,
    const String &method,
    const String &url,
    JsonDocument *responseDoc,
    int &statusCode,
    const char *jsonBody) {
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
        statusCode = http.POST(
            reinterpret_cast<uint8_t *>(const_cast<char *>(jsonBody)),
            strlen(jsonBody)
        );
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

bool sendRequest(
    const String &method,
    const String &url,
    JsonDocument *responseDoc,
    int &statusCode,
    const char *jsonBody = nullptr) {
    ensureWifiConnected();

    if (isHttpsUrl(url)) {
        WiFiClientSecure secureClient;
        configureSecureClient(secureClient, url);
        return sendRequestWithClient(secureClient, method, url, responseDoc, statusCode, jsonBody);
    }

    WiFiClient client;
    return sendRequestWithClient(client, method, url, responseDoc, statusCode, jsonBody);
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

  renderForestUi();
  return true;
}

bool fetchWaterSummary() {
  StaticJsonDocument<1536> doc;
  int statusCode = 0;
  String url = buildWaterUrl("/api/water/device-status?user_id=" + String(WATER_USER_ID));

  if (!sendRequest("GET", url, &doc, statusCode)) {
    return false;
  }

  if (statusCode != 200) {
    Serial.println("Summary fetch returned non-200");
    return false;
  }

  serverTimeUtc = String(doc["server_time_utc"] | "");
  waterPercent = clampPercent(doc["water_percent"] | 0);
  stressPercent = clampPercent(doc["stress_percent"] | 0);

  JsonObject water = doc["water"];
  totalIntakeLiters = water["total_intake_liters"] | 0.0f;
  dailyGoalLiters = water["goal_liters"] | dailyGoalLiters;
  nextReminderAt = String(water["next_reminder_at"] | "");

  Serial.printf(
      "Device status: water=%u%% stress=%u%%, %.2f / %.2f L\n",
      waterPercent,
      stressPercent,
      totalIntakeLiters,
      dailyGoalLiters);
  renderForestUi();
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
  waterPercent = clampPercent(today["progress_percent"] | waterPercent);

  Serial.printf("Logged intake: %d mL, total now %.2f L\n", amountMl, totalIntakeLiters);
  renderForestUi();
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
      renderForestUi();
    }
    return true;
  }

  JsonObject payload = doc["payload"];
  reminderTitle = String(payload["title"] | "Drink water");
  reminderMessage = String(payload["message"] | "Time to hydrate!");
  reminderAnimation = String(payload["animation"] | "");

  waterReminderActive = true;
  setReminderTone(true);
  renderForestUi();

  Serial.printf("Reminder animation: %s\n", reminderAnimation.c_str());

  acknowledgeWaterReminder();
  return true;
}

void initializeScreenAndAudio() {
    SPI.begin(TFT_SDK, 19, TFT_SDA, TFT_A0);

    tft.initR(INITR_GREENTAB);
    tft.setRotation(0);
    tft.fillScreen(ST77XX_BLACK); 
    delay(300);
    drawStatus("Booting ESP32", "Preparing network");

    ledcAttach(AUDIO_PIN, 2000, 8);
    setReminderTone(false);
}

 // namespace

void setup() {
  Serial.begin(115200);
  delay(250);

  initializeScreenAndAudio();
//   ensureWifiConnected();

//   fetchWaterSchedule();
//   fetchWaterSummary();
//   pollWaterReminder();

  lastReminderPollAt = millis();
  lastSummaryRefreshAt = millis();
  lastScheduleRefreshAt = millis();
}

// void loop() {
//     drawCatSprite(0, 0, 100);
// }
// void loop() {
//     Serial.println("in loop");
//     tft.fillScreen(ST77XX_BLACK); delay(300);
//     tft.fillScreen(ST77XX_WHITE); delay(300);
// }

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