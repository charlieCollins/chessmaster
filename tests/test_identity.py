# tests/test_identity.py
# Who is signed in: Cloudflare Access puts a signed JWT on every request; the app trusts the
# email inside it only after checking signature, audience, issuer and expiry.
import os
os.environ.setdefault("DATABASE_URL", "sqlite://")

import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from starlette.requests import Request

from backend import identity

TEAM = "team.cloudflareaccess.com"
AUD = "aud-tag-123"
KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTHER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


class FakeJWKs:
    """Stands in for PyJWKClient: returns our public key for the token's kid."""
    def get_signing_key_from_jwt(self, token):
        class K:
            key = KEY.public_key()
        return K()


def token(key=KEY, **over):
    claims = {"email": "Someone@Example.com", "aud": [AUD], "iss": f"https://{TEAM}",
              "iat": int(time.time()), "exp": int(time.time()) + 300}
    claims.update(over)
    return jwt.encode(claims, key, algorithm="RS256", headers={"kid": "k1"})


def test_valid_token_gives_lowercased_email():
    assert identity.verify_access_token(token(), TEAM, AUD, FakeJWKs()) == "someone@example.com"


@pytest.mark.parametrize("bad", [
    {"aud": ["some-other-app"]},
    {"iss": "https://evil.cloudflareaccess.com"},
    {"exp": int(time.time()) - 10},
    {"email": None},
])
def test_rejects_wrong_audience_issuer_expired_or_no_email(bad):
    with pytest.raises(jwt.PyJWTError):
        identity.verify_access_token(token(**bad), TEAM, AUD, FakeJWKs())


def test_rejects_token_signed_by_another_key():
    with pytest.raises(jwt.PyJWTError):
        identity.verify_access_token(token(key=OTHER_KEY), TEAM, AUD, FakeJWKs())


def _request(headers: dict) -> Request:
    return Request({"type": "http", "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()]})


def test_local_mode_without_access_config(monkeypatch):
    monkeypatch.delenv("CF_ACCESS_TEAM_DOMAIN", raising=False)
    monkeypatch.delenv("CF_ACCESS_AUD", raising=False)
    monkeypatch.setenv("CHESS_LOCAL_USER", "me@local")
    assert identity.current_user(_request({})) == "me@local"


def test_access_mode_requires_a_valid_token(monkeypatch):
    monkeypatch.setenv("CF_ACCESS_TEAM_DOMAIN", TEAM)
    monkeypatch.setenv("CF_ACCESS_AUD", AUD)
    monkeypatch.setattr(identity, "_jwks", lambda team: FakeJWKs())
    with pytest.raises(HTTPException) as e:
        identity.current_user(_request({}))
    assert e.value.status_code == 401
    # A bare email header (spoofable if the origin is hit directly) is not enough
    with pytest.raises(HTTPException):
        identity.current_user(_request({"Cf-Access-Authenticated-User-Email": "boss@example.com"}))
    assert identity.current_user(_request({"Cf-Access-Jwt-Assertion": token()})) == "someone@example.com"
