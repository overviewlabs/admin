"""Regression check: operational errors must not retain search content."""
import importlib.util
import io
import logging
from pathlib import Path
import types
import unittest
from unittest.mock import patch


class PrivateLoggingTest(unittest.TestCase):
    def test_query_arguments_and_exception_contents_are_omitted(self):
        webapp = types.ModuleType("searx.webapp")
        webapp.app = object()
        spec = importlib.util.spec_from_file_location(
            "private_logging_under_test", Path(__file__).with_name("overview_searxng.py")
        )
        module = importlib.util.module_from_spec(spec)
        with patch.dict("sys.modules", {"searx.webapp": webapp}):
            spec.loader.exec_module(module)
        stream = io.StringIO()
        handler = logging.StreamHandler(stream)
        logger = logging.getLogger("searx.engines.privacy_test")
        logger.addHandler(handler)
        logger.propagate = False
        try:
            module.configure_private_logging()
            try:
                raise ValueError("fake-credential-MUST-NOT-LOG")
            except ValueError:
                logger.exception("query=%s", "private-query-MUST-NOT-LOG")
            self.assertEqual(
                stream.getvalue(),
                "ERROR searx.engines.privacy_test: service event (content omitted)\n",
            )
        finally:
            logger.removeHandler(handler)


if __name__ == "__main__":
    unittest.main()
