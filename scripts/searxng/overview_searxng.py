"""Production WSGI entrypoint with content-free operational logging.

Search query strings, response content and upstream exception text must never
be written to journald. Granian access logging is also disabled in the unit.
The JSON search response still includes upstream engine failure categories.
"""
import logging
import re


class PrivateFormatter(logging.Formatter):
    def format(self, record):
        component = re.sub(r"[^a-zA-Z0-9_.-]", "_", record.name)[:96]
        return f"{record.levelname} {component}: service event (content omitted)"


def configure_private_logging():
    formatter = PrivateFormatter()
    if not logging.getLogger().handlers:
        logging.getLogger().addHandler(logging.StreamHandler())
    for candidate in [logging.getLogger(), *logging.Logger.manager.loggerDict.values()]:
        if isinstance(candidate, logging.Logger):
            for handler in candidate.handlers:
                handler.setFormatter(formatter)


configure_private_logging()
from searx.webapp import app as application  # noqa: E402
configure_private_logging()
