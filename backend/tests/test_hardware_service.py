"""Tests for HardwareService."""

import os
import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from app.services.hardware_service import (
    HardwareService,
    CompileResult,
    FlashResult,
    BoardInfo,
)


@pytest.fixture
def hw_service():
    return HardwareService()


class TestCompile:
    async def test_compile_valid_python(self, hw_service, tmp_path):
        (tmp_path / "main.py").write_text("x = 1 + 2\n")
        result = await hw_service.compile(str(tmp_path))
        assert result.success is True
        assert result.errors == []
        assert result.output_path == str(tmp_path)

    async def test_compile_invalid_python(self, hw_service, tmp_path):
        (tmp_path / "bad.py").write_text("def broken(\n")
        result = await hw_service.compile(str(tmp_path))
        assert result.success is False
        assert len(result.errors) > 0

    async def test_compile_no_python_files(self, hw_service, tmp_path):
        (tmp_path / "readme.txt").write_text("hello")
        result = await hw_service.compile(str(tmp_path))
        assert result.success is False
        assert "No Python files found" in result.errors[0]

    async def test_compile_skips_hidden_dirs(self, hw_service, tmp_path):
        hidden = tmp_path / ".git"
        hidden.mkdir()
        (hidden / "config.py").write_text("def broken(\n")
        (tmp_path / "main.py").write_text("x = 1\n")
        result = await hw_service.compile(str(tmp_path))
        assert result.success is True

    async def test_compile_multiple_files(self, hw_service, tmp_path):
        (tmp_path / "a.py").write_text("a = 1\n")
        (tmp_path / "b.py").write_text("b = 2\n")
        result = await hw_service.compile(str(tmp_path))
        assert result.success is True


class TestDetectBoard:
    async def test_detect_board_no_pyserial(self, hw_service):
        with patch.dict("sys.modules", {"serial": None, "serial.tools": None, "serial.tools.list_ports": None}):
            result = await hw_service.detect_board()
            assert result is None

    async def test_detect_board_no_boards(self, hw_service):
        mock_list_ports = MagicMock()
        mock_list_ports.comports.return_value = []
        with patch.dict("sys.modules", {"serial.tools.list_ports": mock_list_ports}):
            result = await hw_service.detect_board()
            assert result is None

    async def test_detect_board_known_board(self, hw_service):
        mock_port = MagicMock()
        mock_port.vid = 0x10C4
        mock_port.pid = 0xEA60
        mock_port.device = "COM3"
        mock_list_ports = MagicMock()
        mock_list_ports.comports.return_value = [mock_port]
        mock_serial = MagicMock()
        mock_serial_tools = MagicMock()
        mock_serial.tools = mock_serial_tools
        mock_serial_tools.list_ports = mock_list_ports
        with patch.dict("sys.modules", {
            "serial": mock_serial,
            "serial.tools": mock_serial_tools,
            "serial.tools.list_ports": mock_list_ports,
        }):
            result = await hw_service.detect_board()
            assert result is not None
            assert result.port == "COM3"
            assert "CP210x" in result.board_type

    async def test_detect_board_unknown_vid_pid(self, hw_service):
        mock_port = MagicMock()
        mock_port.vid = 0xFFFF
        mock_port.pid = 0xFFFF
        mock_port.device = "COM5"
        mock_list_ports = MagicMock()
        mock_list_ports.comports.return_value = [mock_port]
        with patch.dict("sys.modules", {"serial.tools.list_ports": mock_list_ports}):
            result = await hw_service.detect_board()
            assert result is None


class TestFlash:
    async def test_flash_no_board_detected(self, hw_service, tmp_path):
        (tmp_path / "main.py").write_text("x = 1\n")
        with patch.object(hw_service, "detect_board", return_value=None):
            result = await hw_service.flash(str(tmp_path))
            assert result.success is False
            assert "No ESP32" in result.message

    async def test_flash_no_python_files(self, hw_service, tmp_path):
        result = await hw_service.flash(str(tmp_path), port="COM3")
        assert result.success is False
        assert "No Python files" in result.message

    async def test_flash_mpremote_not_found(self, hw_service, tmp_path):
        (tmp_path / "main.py").write_text("x = 1\n")
        with patch("asyncio.create_subprocess_exec", side_effect=FileNotFoundError):
            result = await hw_service.flash(str(tmp_path), port="COM3")
            assert result.success is False
            assert "mpremote not found" in result.message

    async def test_flash_success(self, hw_service, tmp_path):
        (tmp_path / "main.py").write_text("x = 1\n")
        mock_proc = AsyncMock()
        mock_proc.returncode = 0
        mock_proc.communicate = AsyncMock(return_value=(b"OK", b""))
        with patch("asyncio.create_subprocess_exec", return_value=mock_proc):
            result = await hw_service.flash(str(tmp_path), port="COM3")
            assert result.success is True
            assert "COM3" in result.message

    async def test_flash_failure(self, hw_service, tmp_path):
        (tmp_path / "main.py").write_text("x = 1\n")
        mock_proc = AsyncMock()
        mock_proc.returncode = 1
        mock_proc.communicate = AsyncMock(return_value=(b"", b"Error: board not responding"))
        with patch("asyncio.create_subprocess_exec", return_value=mock_proc):
            result = await hw_service.flash(str(tmp_path), port="COM3")
            assert result.success is False
            assert "board not responding" in result.message


class TestDataclasses:
    def test_compile_result_defaults(self):
        r = CompileResult(success=True)
        assert r.errors == []
        assert r.output_path == ""

    def test_flash_result_defaults(self):
        r = FlashResult(success=False)
        assert r.message == ""

    def test_board_info(self):
        b = BoardInfo(port="COM3", board_type="ESP32")
        assert b.port == "COM3"
