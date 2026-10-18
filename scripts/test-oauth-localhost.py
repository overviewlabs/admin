import importlib.util
from pathlib import Path
import unittest
from urllib.parse import parse_qs, urlsplit

spec = importlib.util.spec_from_file_location("relay", Path(__file__).resolve().parents[1] / "ui/public/overview-oauth-localhost.py")
relay = importlib.util.module_from_spec(spec)
spec.loader.exec_module(relay)
STATE = "whox-local-v1." + "a" * 43 + "." + "b" * 43


class CallbackTests(unittest.TestCase):
    def test_preserves_code_state_and_issuer_without_forwarding_extra_values(self):
        result = urlsplit(relay.callback_location("/callback?code=one%2Btwo&state=" + STATE + "&iss=https%3A%2F%2Fagent.robinhood.com%2Fmcp%2Ftrading&redirect_uri=https%3A%2F%2Fevil.example", "localhost:8765"))
        self.assertEqual(result.scheme, "https")
        self.assertEqual(result.netloc, "overviewlabs.ai")
        self.assertEqual(result.path, "/api/tools/oauth/callback")
        self.assertEqual(parse_qs(result.query), {"code": ["one+two"], "state": [STATE], "iss": ["https://agent.robinhood.com/mcp/trading"]})

    def test_provider_denial_is_forwarded_without_untrusted_prose(self):
        result = relay.callback_location("/callback?state=" + STATE + "&error=access_denied&error_description=secret", "[::1]:8765")
        self.assertIn("error=access_denied", result)
        self.assertNotIn("secret", result)

    def test_rejects_invalid_hosts_paths_and_ambiguous_parameters(self):
        valid = "/callback?state=" + STATE + "&code=one"
        cases = [(valid, "evil.example:8765"), ("https://evil.example" + valid, "localhost:8765"), (valid.replace("/callback?", "/other?"), "localhost:8765"), (valid + "&state=two", "localhost:8765"), (valid + "&code=two", "localhost:8765"), (valid + "&error=access_denied", "localhost:8765"), ("/callback?code=one&state=invalid", "localhost:8765")]
        for path, host in cases:
            with self.subTest(path=path, host=host), self.assertRaises(ValueError):
                relay.callback_location(path, host)


if __name__ == "__main__":
    unittest.main()
