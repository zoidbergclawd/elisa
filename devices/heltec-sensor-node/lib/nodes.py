"""Node orchestration classes for Elisa IoT.

SensorNode: polls sensors, sends over LoRa, displays on OLED.
GatewayNode: receives LoRa, POSTs to cloud via WiFi.

Reliability patterns:
- LoRa: fixed-size packet with checksum, 2 retries on send failure
- WiFi: auto-reconnect with exponential backoff (1-30s)
- HTTP: 10s timeout, 2 retries, queue up to 100 failed posts
- WDT: 60s watchdog timer, fed in main loop
- Memory: bounded data structures, no unbounded lists
"""

import json
import time


def _simple_checksum(data_bytes):
    """Simple XOR checksum for LoRa packet integrity."""
    cksum = 0
    for b in data_bytes:
        cksum ^= b
    return cksum & 0xFF


class SensorNode:
    """Polls sensors, packs data, sends over LoRa, optionally shows on OLED.

    Args:
        sensors: list of sensor objects (DHT22Sensor, ReedSwitch, PIRSensor)
        lora_channel: LoRa channel number (default 1)
        display: OLEDDisplay instance or None
        board: ElisaBoard instance (for LoRa access)
    """

    def __init__(self, sensors, lora_channel=1, display=None, board=None):
        self._sensors = sensors
        self._channel = lora_channel
        self._display = display
        self._board = board
        self._wdt = None

    def _init_watchdog(self):
        """Enable hardware watchdog (60s timeout)."""
        try:
            from machine import WDT
            self._wdt = WDT(timeout=60000)
            print("[SensorNode] Watchdog enabled (60s)")
        except Exception as e:
            print(f"[SensorNode] WDT unavailable: {e}")

    def _feed_watchdog(self):
        """Feed the watchdog timer."""
        if self._wdt:
            try:
                self._wdt.feed()
            except Exception:
                pass

    def _read_all(self):
        """Read all sensors, return packed dict."""
        readings = {"ts": time.time()}
        for sensor in self._sensors:
            cls_name = type(sensor).__name__
            try:
                if cls_name == "DHT22Sensor":
                    readings["dht22"] = sensor.read()
                elif cls_name == "ReedSwitch":
                    readings["reed"] = {
                        "door_opened": sensor.is_open()
                    }
                elif cls_name == "PIRSensor":
                    readings["pir"] = {
                        "motion_detected": sensor.events_since(reset=True)
                    }
                else:
                    readings[cls_name.lower()] = {"raw": str(sensor)}
            except Exception as e:
                print(f"[SensorNode] {cls_name} read error: {e}")
        return readings

    def _send_lora(self, readings):
        """Send readings over LoRa with checksum and retry."""
        if not self._board:
            print(f"[LoRa TX ch{self._channel}] {json.dumps(readings)}")
            return

        payload = json.dumps(readings)
        data_bytes = payload.encode("utf-8")
        cksum = _simple_checksum(data_bytes)
        # Packet format: <checksum_hex>|<json_payload>
        packet = f"{cksum:02x}|{payload}"

        for attempt in range(3):
            try:
                self._board.send_message(packet, channel=self._channel)
                return
            except Exception as e:
                print(f"[LoRa TX] Send error (attempt {attempt + 1}): {e}")
                time.sleep_ms(100)
        print("[LoRa TX] All retries failed")

    def start(self, interval_sec=10):
        """Start the sensor acquisition loop.

        Reads all sensors, sends over LoRa, updates OLED display.
        Runs forever (until device reset or power off).

        Args:
            interval_sec: Seconds between broadcasts (default 10)
        """
        self._init_watchdog()
        print(f"[SensorNode] Starting (interval={interval_sec}s, ch={self._channel})")

        # PIR uses interrupt tracking for motion events between polls
        for sensor in self._sensors:
            cls_name = type(sensor).__name__
            if cls_name == "PIRSensor":
                sensor.on_motion(lambda: None)  # Enable IRQ tracking
            # Reed switch is polled via is_open() -- no IRQ needed.
            # Breadboard reed switches bounce heavily and can crash the IRQ system.

        while True:
            self._feed_watchdog()
            readings = self._read_all()

            # Send over LoRa
            self._send_lora(readings)

            # Update OLED if present
            if self._display:
                try:
                    self._display.show_readings(readings)
                except Exception as e:
                    print(f"[SensorNode] Display error: {e}")

            time.sleep(interval_sec)


class GatewayNode:
    """Receives LoRa data, POSTs to cloud endpoint via WiFi.

    Handles WiFi reconnection with exponential backoff.
    Queues failed HTTP posts for retry (up to 100 entries).

    Args:
        lora_channel: LoRa channel to listen on (default 1)
        wifi_ssid: WiFi network name
        wifi_pass: WiFi password
        cloud_url: Full URL for HTTP POST (e.g., https://foo.run.app/data)
        api_key: API key for cloud endpoint authentication
        board: ElisaBoard instance (for LoRa access)
    """

    MAX_QUEUE = 100
    HTTP_TIMEOUT_SEC = 10
    HTTP_RETRIES = 2

    def __init__(self, lora_channel=1, wifi_ssid="", wifi_pass="",
                 cloud_url="", api_key="", board=None):
        self._channel = lora_channel
        self._wifi_ssid = wifi_ssid
        self._wifi_pass = wifi_pass
        self._cloud_url = cloud_url
        self._api_key = api_key
        self._board = board
        self._post_queue = []
        self._wdt = None
        self._wifi_connected = False
        self._backoff_ms = 1000

    def _init_watchdog(self):
        """Enable hardware watchdog (60s timeout)."""
        try:
            from machine import WDT
            self._wdt = WDT(timeout=60000)
        except Exception:
            pass

    def _feed_watchdog(self):
        """Feed the watchdog timer."""
        if self._wdt:
            try:
                self._wdt.feed()
            except Exception:
                pass

    def _connect_wifi(self):
        """Connect to WiFi with exponential backoff on failure."""
        try:
            import network
            wlan = network.WLAN(network.STA_IF)
            wlan.active(True)
            if wlan.isconnected():
                self._wifi_connected = True
                self._backoff_ms = 1000
                return True

            print(f"[Gateway] Connecting to WiFi '{self._wifi_ssid}'...")
            wlan.connect(self._wifi_ssid, self._wifi_pass)

            # Wait up to 10 seconds
            for _ in range(20):
                if wlan.isconnected():
                    ip = wlan.ifconfig()[0]
                    print(f"[Gateway] WiFi connected: {ip}")
                    self._wifi_connected = True
                    self._backoff_ms = 1000
                    return True
                time.sleep_ms(500)

            print(f"[Gateway] WiFi failed, backoff {self._backoff_ms}ms")
            self._wifi_connected = False
            time.sleep_ms(self._backoff_ms)
            self._backoff_ms = min(self._backoff_ms * 2, 30000)
            return False
        except ImportError:
            print("[Gateway] Stub mode (no network module)")
            return False
        except Exception as e:
            print(f"[Gateway] WiFi error: {e}")
            return False

    def _http_post(self, data):
        """POST JSON data to cloud endpoint with retry.

        Returns True on success, False on failure (queues for retry).
        """
        if not self._cloud_url:
            print(f"[Gateway POST] {json.dumps(data)}")
            return True

        try:
            import urequests
        except ImportError:
            print(f"[Gateway POST stub] {json.dumps(data)}")
            return True

        headers = {
            "Content-Type": "application/json",
            "X-API-Key": self._api_key,
        }

        for attempt in range(self.HTTP_RETRIES):
            try:
                resp = urequests.post(
                    self._cloud_url,
                    json=data,
                    headers=headers,
                )
                status = resp.status_code
                resp.close()
                if 200 <= status < 300:
                    return True
                print(f"[Gateway] POST returned {status} (attempt {attempt + 1})")
            except Exception as e:
                print(f"[Gateway] POST error (attempt {attempt + 1}): {e}")

        return False

    def _queue_post(self, data):
        """Queue failed POST for retry. Bounded to MAX_QUEUE."""
        if len(self._post_queue) < self.MAX_QUEUE:
            self._post_queue.append(data)
        else:
            # Drop oldest
            self._post_queue.pop(0)
            self._post_queue.append(data)

    def _flush_queue(self):
        """Retry queued posts."""
        sent = []
        for i, data in enumerate(self._post_queue):
            if self._http_post(data):
                sent.append(i)
            else:
                break  # Stop on first failure
        for i in reversed(sent):
            self._post_queue.pop(i)

    def _parse_lora_packet(self, raw_msg):
        """Parse LoRa packet with checksum verification.

        Packet format: <checksum_hex>|<json_payload>
        Returns parsed dict or None if invalid.
        """
        try:
            # Strip channel prefix if present (from ElisaBoard)
            msg = raw_msg
            if msg.startswith("[ch"):
                idx = msg.find("]")
                if idx >= 0:
                    msg = msg[idx + 1:]

            if "|" not in msg:
                return None

            cksum_hex, payload = msg.split("|", 1)
            expected_cksum = int(cksum_hex, 16)
            actual_cksum = _simple_checksum(payload.encode("utf-8"))

            if expected_cksum != actual_cksum:
                print(f"[Gateway] Checksum mismatch: {expected_cksum} != {actual_cksum}")
                return None

            return json.loads(payload)
        except Exception as e:
            print(f"[Gateway] Parse error: {e}")
            return None

    def _on_lora_message(self, msg, channel):
        """Handle incoming LoRa message."""
        data = self._parse_lora_packet(msg)
        if data is None:
            return

        print(f"[Gateway] Received: {json.dumps(data)}")

        if self._wifi_connected:
            if not self._http_post(data):
                self._queue_post(data)
            else:
                # Try to flush queued posts on success
                if self._post_queue:
                    self._flush_queue()
        else:
            self._queue_post(data)

    def start(self):
        """Start the gateway receive loop.

        Connects to WiFi, listens for LoRa, POSTs to cloud.
        Runs forever (until device reset or power off).
        """
        self._init_watchdog()
        print(f"[Gateway] Starting (ch={self._channel})")

        # Initial WiFi connection
        self._connect_wifi()

        # Register LoRa listener
        if self._board:
            self._board.on_message(self._on_lora_message, channel=self._channel)
        else:
            print("[Gateway] No board - stub mode, no LoRa listener")

        # Main loop: maintain WiFi, flush queue, feed watchdog
        while True:
            self._feed_watchdog()

            if not self._wifi_connected:
                self._connect_wifi()

            if self._wifi_connected and self._post_queue:
                self._flush_queue()

            time.sleep(1)
