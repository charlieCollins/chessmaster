# backend/identity.py
"""Who is signed in.

Behind Cloudflare Access every request carries `Cf-Access-Jwt-Assertion`, a JWT signed by
the Access team's keys. With CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD set (on the server,
via /etc/chess/chess.env) the app verifies it and uses the email inside as the user — a
plain email header is never trusted, since anyone reaching the origin directly could send
one. Without that config (local development) everyone is CHESS_LOCAL_USER (default "local").
"""
from __future__ import annotations

import functools
import os

import jwt
from fastapi import HTTPException, Request

ACCESS_HEADER = "Cf-Access-Jwt-Assertion"


@functools.lru_cache(maxsize=4)
def _jwks(team: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(f"https://{team}/cdn-cgi/access/certs", cache_keys=True)


def verify_access_token(token: str, team: str, aud: str, jwks=None) -> str:
    """Email from a Cloudflare Access JWT; raises jwt.PyJWTError unless it is valid for this app."""
    client = jwks or _jwks(team)
    key = client.get_signing_key_from_jwt(token).key
    claims = jwt.decode(token, key, algorithms=["RS256"], audience=aud, issuer=f"https://{team}",
                        options={"require": ["exp", "iat", "aud", "iss"]})
    email = claims.get("email")
    if not email or not isinstance(email, str):
        raise jwt.InvalidTokenError("token has no email")
    return email.strip().lower()


def current_user(request: Request) -> str:
    """FastAPI dependency: the signed-in user's id (email), or the local user in development."""
    team, aud = os.getenv("CF_ACCESS_TEAM_DOMAIN"), os.getenv("CF_ACCESS_AUD")
    if not (team and aud):
        return os.getenv("CHESS_LOCAL_USER", "local")
    token = request.headers.get(ACCESS_HEADER)
    if not token:
        raise HTTPException(401, "Sign in through Cloudflare Access")
    try:
        return verify_access_token(token, team, aud, _jwks(team))
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid Cloudflare Access token")
