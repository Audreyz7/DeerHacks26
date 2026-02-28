#include <arduino.h>

#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7735.h>

#define TFT_CS  5
#define TFT_RST 21
#define TFT_SDK 18
#define TFT_A0 19 
#define TFT_SDA 23
Adafruit_ST7735 tft = Adafruit_ST7735(TFT_CS, TFT_A0, TFT_RST);

void setup() {
    SPI.begin(TFT_SDK, 2, TFT_SDA, TFT_CS);

    tft.initR(INITR_GREENTAB);
    tft.setRotation(0);

    tft.fillScreen(ST77XX_BLACK); delay(300);
}

void loop() {
    tft.fillScreen(ST77XX_BLACK); delay(300);
    tft.fillScreen(ST77XX_WHITE); delay(300);
}