# Hardware Architecture & Bill of Materials (BOM)
## Project: Deep-Sea Rescue Support System (Sonar + AI)

---

## 1. Executive Summary & Hardware Strategy

Deploying deep learning for underwater search and rescue requires bridging **acoustic sensing**, **real-time edge compute**, and **subsea-to-surface communications**. 

Because marine-grade acoustic equipment is capital-intensive, this document details two complete hardware architectures:
1. **Tier 1: Low-Cost Hardware-in-the-Loop (HIL) Testbed (< ₹5,000 INR)** — A physical acoustic scanning rig and murky-water emulation testbed designed for laboratory validation, university evaluations, and project vivas.
2. **Tier 2: Industrial / Deep-Sea Production Grade (₹45–60 Lakhs INR)** — The field-deployable specification utilizing a multibeam forward-looking sonar, subsea edge compute, and a tethered ROV platform as formulated in our research paper.

---

## 2. Tier 1: Low-Cost Hardware-in-the-Loop (HIL) Rig (< ₹5,000)

### 2.1 Concept & Working Principle
In defense and maritime R&D, algorithm validation is performed on **Hardware-in-the-Loop (HIL)** rigs before risking expensive hardware. 
- A waterproof ultrasonic acoustic transducer (40 kHz acoustic sound pulse) is mounted on a metal-gear servo motor.
- The servo performs a sector scan sweeping across **$0^\circ$ to $130^\circ$** (matching the $130^\circ$ Field of View in our research paper).
- The microcontroller measures the acoustic time-of-flight (distance $r$) at each step angle ($\theta$), formatting it as `(angle, distance)` telemetry.
- The telemetry is streamed over USB Serial to your Python backend, converting polar coordinates into Cartesian acoustic frames fed into the YOLOv8 and Next.js dashboard pipeline.

```
       [Target / Obstacle]
               ▲
               │  Acoustic Echo (40 kHz)
     [JSN-SR04T Waterproof Transducer]
               │
        [MG90S Servo Motor]  <--- Sweeps 0° to 130° FOV
               │
         [ESP32 / Arduino]
               │  USB Serial (`pyserial` at 115200 baud)
               ▼
     [Laptop / Processing Unit]
     • Polar-to-Cartesian Frame Generator
     • YOLOv8 Detection & Metric Localization
     • Next.js Operator Dashboard (Port 3000)
```

---

### 2.2 Complete Bill of Materials (BOM) — Student Setup

| Component | Technical Specification | Purpose in System | Sourcing (India) | Approx. Cost (INR) |
|---|---|---|---|---|
| **ESP32 NodeMCU / Arduino Uno** | 32-bit dual-core, 240 MHz, CP2102 USB-to-UART driver | Controls servo sweep, measures acoustic echo timing, streams serial data | Robu.in / Amazon.in | ₹450 |
| **JSN-SR04T Waterproof Ultrasonic Transducer** | IP67 sealed acoustic probe, 40 kHz frequency, 20 cm – 450 cm range, 5V DC | Emits acoustic pulses and captures acoustic echoes through water/air | Robu.in / ElectronicsComp | ₹550 |
| **MG90S Metal-Gear Micro Servo** | 180° rotation, 2.2 kg·cm torque, metal gear train | Actuates the acoustic transducer across the $130^\circ$ sonar aperture | Robu.in | ₹180 |
| **Mini Pan-Tilt / Servo Mount Bracket** | Acrylic or 3D-printed bracket for servo + sensor | Holds transducer securely on the servo horn | Robu.in / DIY | ₹150 |
| **IP67 Waterproof USB Snake Camera (Endoscope)** | 5-meter flexible cable, 6 adjustable LEDs, 640x480 resolution, USB interface | For optical murky-water validation (live feed into `/ws/stream`) | Amazon.in | ₹799 |
| **Transparent Acrylic Container / Mini Tank** | 15–20 Litre plastic/acrylic tub | Test water tank (soil/milk added to simulate deep-sea turbidity) | D-Mart / Local market | ₹350 |
| **Breadboard, Jumper Wires & 5V Adapter** | 400-point breadboard, Dupont wires (M-M, M-F), 5V 2A power supply | Power distribution for servo and sensor | Local Electronics Shop | ₹300 |
| **Targets for Detection** | Miniature toy diver (human), toy submarine (ROV), soda can (cylinder), small rubber tire | Real physical targets placed in the scanning area | Household items / Toys | ₹200 |
| **Total Cost** | | | | **~₹2,979 INR** |

---

### 2.3 Pinout & Wiring Connections

#### ESP32 to JSN-SR04T Ultrasonic Sensor:
| JSN-SR04T Pin | ESP32 Pin | Wire Color / Notes |
|---|---|---|
| **VCC** | `5V` (or `VIN`) | Red (Requires stable 5V) |
| **GND** | `GND` | Black |
| **TRIG** | `GPIO 5` | Yellow (Trigger pulse 10 µs) |
| **ECHO** | `GPIO 18` | Green (Echo return pulse) |

#### ESP32 to MG90S Servo Motor:
| Servo Pin | ESP32 Pin | Notes |
|---|---|---|
| **VCC (Red)** | External 5V / `VIN` | Do not power servo directly from 3.3V pin |
| **GND (Brown/Black)** | Common `GND` | Must share common ground with ESP32 |
| **PWM Signal (Orange/Yellow)**| `GPIO 19` | PWM control signal (50 Hz) |

---

### 2.4 Microcontroller Firmware Snippet (ESP32 / Arduino C++)
Upload this code to the ESP32 using the Arduino IDE:

```cpp
#include <ESP32Servo.h>

Servo sonarServo;
const int trigPin = 5;
const int echoPin = 18;
const int servoPin = 19;

// Sonar geometry matching research paper (130-degree FOV)
const int START_ANGLE = 25;
const int END_ANGLE = 155; // 155 - 25 = 130 degree aperture

void setup() {
  Serial.begin(115200);
  sonarServo.attach(servoPin);
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
}

long getDistanceCM() {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);
  long duration = pulseIn(echoPin, HIGH, 30000); // 30ms timeout
  if (duration == 0) return 400; // max range fallback
  return (duration * 0.0343) / 2;
}

void loop() {
  // Sweep Forward (Left to Right)
  for (int angle = START_ANGLE; angle <= END_ANGLE; angle += 2) {
    sonarServo.write(angle);
    delay(20);
    long dist = getDistanceCM();
    int normalizedAngle = angle - 90; // Center is 0 degrees (-65 to +65)
    Serial.printf("%d,%ld\n", normalizedAngle, dist);
  }
  // Sweep Backward (Right to Left)
  for (int angle = END_ANGLE; angle >= START_ANGLE; angle -= 2) {
    sonarServo.write(angle);
    delay(20);
    long dist = getDistanceCM();
    int normalizedAngle = angle - 90;
    Serial.printf("%d,%ld\n", normalizedAngle, dist);
  }
}
```

---

## 3. Tier 2: Field-Deployable Industrial / Marine Architecture

For actual deep-sea search and rescue deployment on an offshore vessel, the system requires marine-certified hardware.

```
                    SURFACE STATION (Vessel Control Room)
  ┌────────────────────────────────────────────────────────────────────────┐
  │  Operator Workstation (Ruggedized Laptop)                              │
  │  • Next.js Operator Dashboard (`sonar-web-dashboard`)                  │
  │  • Topside Power Supply Unit (400V DC transmission down tether)        │
  │  • Fathom-X Surface Box (Ethernet-over-Twisted-Pair Bridge)            │
  └───────────────────────────────────┬────────────────────────────────────┘
                                      │
                                      │  100m–300m High-Strength
                                      │  Neutral Buoyancy Tether
                                      ▼
                      UNDERWATER VEHICLE (ROV / AUV)
  ┌────────────────────────────────────────────────────────────────────────┐
  │  Watertight 4-inch Hard-Anodized Aluminum Tube (Rated to 300m Depth)   │
  │                                                                        │
  │  ┌──────────────────────────────┐    ┌──────────────────────────────┐  │
  │  │   NVIDIA Jetson Orin NX      │    │  Fathom-X Subsea Transceiver │  │
  │  │   • 16GB VRAM, 100 TOPS AI   │◄───┤  • 100 Mbps Ethernet link    │  │
  │  │   • YOLOv8 TensorRT Engine   │    └──────────────────────────────┘  │
  │  └──────────────┬───────────────┘                                      │
  │                 ▲                                                      │
  │                 │ Gigabit Ethernet                                     │
  │  ┌──────────────┴───────────────┐    ┌──────────────────────────────┐  │
  │  │  Blueprint Oculus M750d Sonar│    │  Vehicle Sensors             │  │
  │  │  • 750 kHz / 1.2 MHz Dual Freq    │  • Bar30 Depth Sensor        │  │
  │  │  • 130° Horiz. / 20° Vert.   │    │  • 9-Axis IMU (Heading)      │  │
  │  └──────────────────────────────┘    └──────────────────────────────┘  │
  └────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Complete Industrial Bill of Materials (BOM)

| Subsystem | Component Name | Manufacturer | Key Specifications | Interface | Estimated Cost (INR) |
|---|---|---|---|---|---|
| **Acoustic Imaging Sensor** | **Oculus M750d / M1200d** | Blueprint Subsea (UK) | 750 kHz / 1.2 MHz dual frequency, 130° horizontal aperture, 512 beams, 120m range, 1000m depth rating | 100 Mbps Ethernet (SubConn connector) | ₹28,00,000 – ₹35,00,000 |
| **Alternative Sonar** | **Gemini 720i** | Tritech International (UK) | 720 kHz, 120° FOV, 0.25° angular resolution, real-time 30 Hz refresh | Ethernet / RS485 | ₹32,00,000 – ₹38,00,000 |
| **Subsea Edge AI Compute** | **Jetson Orin NX Subsea Module** | NVIDIA / Connect Tech | 16GB VRAM, 100 TOPS AI compute, TensorRT optimized, 10–25W power draw | PCIe NVMe, Dual GbE, USB 3.2 | ₹1,60,000 – ₹2,20,000 |
| **ROV Platform** | **BlueROV2 Heavy Configuration** | Blue Robotics (USA) | 8x T200 brushless thrusters, 6-DoF control, payload skid, 100m depth rating | Pixhawk Autopilot (ArduSub) | ₹8,50,000 – ₹11,00,000 |
| **Watertight Pressure Housing** | **4-inch Aluminum Enclosure** | Blue Robotics | Hard-anodized aluminum tube, machined aluminum end caps, 400m depth rating | WetLink bulkheads | ₹85,000 – ₹1,20,000 |
| **Tether & Comm System** | **Fathom High-Strength Tether (150m)** | Blue Robotics | 4 twisted pairs (24 AWG), neutral buoyancy in seawater, 450 kg breaking strength | Fathom-X HomePlug Ethernet | ₹1,80,000 – ₹2,50,000 |
| **Subsea Navigation Sensors** | **Bar30 Depth Sensor + Compass** | Blue Robotics | 0.2 mbar resolution (depth accuracy to 2mm in water), temperature sensor | $I^2C$ bus | ₹25,000 – ₹35,000 |
| **Power Distribution** | **Topside Power Supply (TPS)** | Blue Robotics | 400V DC down tether stepped down to 15V @ 50A inside subsea enclosure | High-voltage tether line | ₹3,00,000 – ₹4,00,000 |
| **Customs & Import Duties**| Mandatory Govt of India Customs | Indian Customs | Integrated GST (18%) + Basic Customs Duty on imported marine electronic sensors | Direct import levy | ₹6,00,000 – ₹8,00,000 |
| **Total (Industrial)** | | | | | **₹50,00,000 – ₹65,00,000 INR** |

---

## 4. Hardware Comparison & Mapping

| Feature | Tier 1: Lab HIL Testbed | Tier 2: Marine Production System |
|---|---|---|
| **Target Budget** | **< ₹5,000 INR** | **₹50,00,000+ INR** |
| **Primary Acoustic Sensor** | JSN-SR04T (40 kHz, single transducer) | Blueprint Oculus M750d (750 kHz, 512 multibeam array) |
| **Aperture / Field of View** | $130^\circ$ (via physical servo mechanical sweep) | $130^\circ$ (simultaneous acoustic beamforming) |
| **Compute Engine** | Existing Host Laptop (Intel/AMD/NVIDIA) | Subsea NVIDIA Jetson Orin NX (TensorRT FP16) |
| **Medium Tested** | Laboratory air / small water tank | Deep ocean / turbid seawater down to 100m+ depth |
| **Telemetry Protocol** | USB Serial UART (`115200 baud`) | Gigabit Ethernet over Fathom-X HomePlug |
| **Dashboard Interface** | Same Next.js Operator Dashboard | Same Next.js Operator Dashboard |
| **Academic Purpose** | Proves engineering design, serial comms & UI | Full commercial deployment for search and rescue |
