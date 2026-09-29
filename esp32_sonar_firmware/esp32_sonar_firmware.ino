/*
  ============================================================================
  DEEP-SEA RESCUE SONAR — ESP32 FIRMWARE
  ============================================================================
  This firmware runs on the ESP32 microcontroller and talks to the Python
  backend (sonar_api.py) over a USB Serial cable.

  HARDWARE CONNECTIONS:
    ESP32 GPIO 5   --> JSN-SR04T / HC-SR04  TRIG pin
    ESP32 GPIO 18  --> JSN-SR04T / HC-SR04  ECHO pin
    ESP32 GPIO 19  --> MG90S Servo          Signal wire (Orange/Yellow)
    ESP32 VIN/5V   --> Servo Red wire + Sonar VCC
    ESP32 GND      --> Servo Brown/Black wire + Sonar GND

  SERIAL PROTOCOL (115200 baud):
    Backend sends commands, ESP32 replies:

    Command       | ESP32 Response               | Description
    ------------- | ----------------------------- | --------------------------------
    PING\n        | PONG\n                        | Heartbeat / handshake check
    READ\n        | <distance_cm>\n               | Single sonar distance reading
    SWEEP\n       | angle:dist,angle:dist,...\n    | Full 130-degree sweep data
    SERVO:<angle> | OK:<angle>\n                  | Move servo to specific angle

    If no command is received for 5 seconds, the ESP32 automatically
    performs continuous sweeps and prints angle,distance CSV lines
    (for standalone Serial Monitor debugging).

  SETUP IN ARDUINO IDE:
    1. Board:  "ESP32 Dev Module"  (or your specific ESP32 board)
    2. Upload Speed: 921600
    3. Port:   COMx  (whichever port your ESP32 shows up as)
    4. Install library: ESP32Servo  (Sketch > Include Library > Manage Libraries)
  ============================================================================
*/

#include <ESP32Servo.h>

// ======================== PIN DEFINITIONS ========================
const int TRIG_PIN  = 5;     // Ultrasonic trigger
const int ECHO_PIN  = 18;    // Ultrasonic echo
const int SERVO_PIN = 19;    // Servo PWM signal

// ======================== SONAR SETTINGS ========================
// 130-degree total Field of View
// Sweeps from 25 deg to 155 deg on servo (center = 90 deg)
// Normalized output: -65 deg to +65 deg (0 = straight ahead)
const int START_ANGLE = 25;
const int END_ANGLE   = 155;
const int STEP_SIZE   = 2;    // Angular resolution in degrees
const long MAX_RANGE_CM = 450; // Maximum sensor range (~4.5 meters)
const int SETTLE_DELAY_MS = 25; // Wait for servo to reach position

// ======================== GLOBALS ========================
Servo sonarServo;
String inputBuffer = "";
unsigned long lastCommandTime = 0;
const unsigned long AUTO_SWEEP_TIMEOUT = 5000; // 5 seconds of silence -> auto sweep

// ======================== SETUP ========================
void setup() {
  Serial.begin(115200);
  while (!Serial) { delay(10); } // Wait for serial port to be ready

  // Configure sonar pins
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  digitalWrite(TRIG_PIN, LOW);

  // Attach servo and center it
  sonarServo.attach(SERVO_PIN);
  sonarServo.write(90); // Center position (straight ahead)
  delay(1000);

  Serial.println("READY"); // Signal to backend that we're alive
}

// ======================== SONAR MEASUREMENT ========================
long measureDistanceCM() {
  // Clear trigger pin
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);

  // Send 10-microsecond trigger pulse
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  // Read echo travel time (timeout at 30ms = ~5.15 meters max)
  long duration = pulseIn(ECHO_PIN, HIGH, 30000);

  if (duration == 0) {
    return MAX_RANGE_CM; // No echo -> return max range
  }

  // Speed of sound in water ≈ 1500 m/s, but we use air speed for bench testing
  // Speed of sound in air = 343 m/s = 0.0343 cm/microsecond
  // Distance = (duration * speed) / 2  (divided by 2 for round-trip)
  long distance = (duration * 0.0343) / 2;

  // Clamp to valid range
  if (distance < 2)   distance = 2;       // Min range of sensor
  if (distance > MAX_RANGE_CM) distance = MAX_RANGE_CM;

  return distance;
}

// ======================== SINGLE READ ========================
void handleRead() {
  long dist = measureDistanceCM();
  Serial.println(dist);
}

// ======================== FULL 130° SWEEP ========================
void handleSweep() {
  // Build response string: "angle:dist,angle:dist,angle:dist,..."
  String result = "";
  bool first = true;

  // Forward sweep: left to right (-65° to +65°)
  for (int angle = START_ANGLE; angle <= END_ANGLE; angle += STEP_SIZE) {
    sonarServo.write(angle);
    delay(SETTLE_DELAY_MS);

    long dist = measureDistanceCM();
    int normalizedAngle = angle - 90; // Convert to -65..+65 range

    if (!first) result += ",";
    result += String(normalizedAngle) + ":" + String(dist);
    first = false;
  }

  Serial.println(result);

  // Return to center after sweep
  sonarServo.write(90);
}

// ======================== SERVO CONTROL ========================
void handleServo(int angle) {
  // Clamp angle to safe range
  if (angle < 0)   angle = 0;
  if (angle > 180) angle = 180;

  sonarServo.write(angle);
  delay(SETTLE_DELAY_MS);
  Serial.println("OK:" + String(angle));
}

// ======================== AUTO-SWEEP (Standalone Mode) ========================
void autoSweep() {
  // Continuous sweep mode for debugging in Arduino Serial Monitor
  // Prints CSV format: normalizedAngle,distance

  // Forward sweep
  for (int angle = START_ANGLE; angle <= END_ANGLE; angle += STEP_SIZE) {
    // Check if a serial command came in — break out if so
    if (Serial.available()) return;

    sonarServo.write(angle);
    delay(SETTLE_DELAY_MS);

    long dist = measureDistanceCM();
    int normalizedAngle = angle - 90;
    Serial.printf("%d,%ld\n", normalizedAngle, dist);
  }

  // Reverse sweep
  for (int angle = END_ANGLE; angle >= START_ANGLE; angle -= STEP_SIZE) {
    if (Serial.available()) return;

    sonarServo.write(angle);
    delay(SETTLE_DELAY_MS);

    long dist = measureDistanceCM();
    int normalizedAngle = angle - 90;
    Serial.printf("%d,%ld\n", normalizedAngle, dist);
  }
}

// ======================== COMMAND PARSER ========================
void processCommand(String cmd) {
  cmd.trim();
  cmd.toUpperCase();
  lastCommandTime = millis();

  if (cmd == "PING") {
    Serial.println("PONG");
  }
  else if (cmd == "READ") {
    handleRead();
  }
  else if (cmd == "SWEEP") {
    handleSweep();
  }
  else if (cmd.startsWith("SERVO:")) {
    int angle = cmd.substring(6).toInt();
    handleServo(angle);
  }
  else {
    // Unknown command — echo it back for debugging
    Serial.println("ERR:UNKNOWN:" + cmd);
  }
}

// ======================== MAIN LOOP ========================
void loop() {
  // Read incoming serial data character-by-character
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      if (inputBuffer.length() > 0) {
        processCommand(inputBuffer);
        inputBuffer = "";
      }
    } else {
      inputBuffer += c;
    }
  }

  // If no command received for 5 seconds, auto-sweep for Serial Monitor debugging
  if (millis() - lastCommandTime > AUTO_SWEEP_TIMEOUT) {
    autoSweep();
  }
}
