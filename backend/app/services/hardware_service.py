"""Manages ESP32 compilation and flashing."""

import asyncio
import logging
import os
import py_compile
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class CompileResult:
    success: bool
    errors: list[str] = field(default_factory=list)
    output_path: str = ""


@dataclass
class FlashResult:
    success: bool
    message: str = ""


@dataclass
class BoardInfo:
    port: str
    board_type: str


class HardwareService:
    """Handles hardware-targeted builds and deployment."""

    # Known ESP32 USB VID/PID pairs
    KNOWN_BOARDS = {
        (0x10C4, 0xEA60): "Heltec WiFi LoRa 32 V3 (CP210x)",
        (0x303A, 0x1001): "ESP32-S3 Native USB",
        (0x1A86, 0x55D4): "ESP32 (CH9102)",
    }

    async def compile(self, project_path: str) -> CompileResult:
        """Compile all Python files in the project using py_compile.

        Args:
            project_path: Path to the project directory

        Returns:
            CompileResult with success status and any errors
        """
        errors: list[str] = []
        py_files: list[str] = []

        for root, _dirs, files in os.walk(project_path):
            # Skip hidden directories and __pycache__
            if any(part.startswith('.') or part == '__pycache__'
                   for part in root.split(os.sep)):
                continue
            for f in files:
                if f.endswith('.py'):
                    py_files.append(os.path.join(root, f))

        if not py_files:
            return CompileResult(success=False, errors=["No Python files found"])

        for filepath in py_files:
            try:
                py_compile.compile(filepath, doraise=True)
            except py_compile.PyCompileError as e:
                errors.append(f"{os.path.basename(filepath)}: {e}")

        return CompileResult(
            success=len(errors) == 0,
            errors=errors,
            output_path=project_path,
        )

    async def flash(self, project_path: str, port: str | None = None) -> FlashResult:
        """Flash project files to connected ESP32 via mpremote.

        Args:
            project_path: Path to the project directory
            port: Serial port (auto-detect if None)

        Returns:
            FlashResult with success status
        """
        if port is None:
            board = await self.detect_board()
            if board is None:
                return FlashResult(
                    success=False,
                    message="No ESP32 board detected. Connect your board via USB and try again.",
                )
            port = board.port

        # Collect Python files to upload
        py_files: list[str] = []
        for root, _dirs, files in os.walk(project_path):
            if any(part.startswith('.') or part == '__pycache__'
                   for part in root.split(os.sep)):
                continue
            for f in files:
                if f.endswith('.py'):
                    py_files.append(os.path.join(root, f))

        if not py_files:
            return FlashResult(success=False, message="No Python files to flash")

        # Build mpremote command: copy files then run main.py
        cp_args = []
        for f in py_files:
            cp_args.extend([f, f":/{os.path.basename(f)}"])

        cmd = ["mpremote", "connect", port, "cp"] + cp_args

        # Check if there's a main.py to run
        main_py = os.path.join(project_path, "main.py")
        if os.path.isfile(main_py):
            cmd.extend(["+", "run", main_py])

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=60)

            if proc.returncode == 0:
                return FlashResult(
                    success=True,
                    message=f"Flashed {len(py_files)} file(s) to {port}",
                )
            else:
                error_msg = stderr.decode("utf-8", errors="replace").strip()
                return FlashResult(
                    success=False,
                    message=f"Flash failed: {error_msg or 'Unknown error'}",
                )
        except FileNotFoundError:
            return FlashResult(
                success=False,
                message="mpremote not found. Install it with: pip install mpremote",
            )
        except asyncio.TimeoutError:
            return FlashResult(success=False, message="Flash timed out after 60 seconds")

    async def detect_board(self) -> BoardInfo | None:
        """Detect a connected ESP32 board by scanning serial ports.

        Returns:
            BoardInfo if a known board is found, None otherwise
        """
        try:
            import serial.tools.list_ports
        except ImportError:
            logger.warning("pyserial not installed, cannot detect boards")
            return None

        for port_info in serial.tools.list_ports.comports():
            vid = port_info.vid
            pid = port_info.pid
            if vid is not None and pid is not None:
                board_type = self.KNOWN_BOARDS.get((vid, pid))
                if board_type:
                    return BoardInfo(port=port_info.device, board_type=board_type)

        return None

    async def start_serial_monitor(
        self, port: str, callback
    ) -> asyncio.Task:
        """Start a serial monitor that reads lines and invokes callback.

        Args:
            port: Serial port to monitor
            callback: Async function called with each line of output

        Returns:
            Cancellable asyncio.Task
        """
        async def _monitor():
            try:
                import serial
            except ImportError:
                await callback("[Error] pyserial not installed")
                return

            try:
                ser = serial.Serial(port, 115200, timeout=1)
            except serial.SerialException as e:
                await callback(f"[Error] Could not open {port}: {e}")
                return

            try:
                while True:
                    if ser.in_waiting > 0:
                        try:
                            line = ser.readline().decode("utf-8", errors="replace").strip()
                            if line:
                                await callback(line)
                        except Exception as e:
                            await callback(f"[Error] {e}")
                    else:
                        await asyncio.sleep(0.1)
            except asyncio.CancelledError:
                pass
            finally:
                ser.close()

        task = asyncio.create_task(_monitor())
        return task
