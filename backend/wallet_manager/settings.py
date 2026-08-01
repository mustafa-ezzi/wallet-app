from pathlib import Path
from datetime import timedelta
from urllib.parse import urlparse
import os

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get(
    'SECRET_KEY',
    'django-insecure-wallet-manager-dev-key-change-in-production-2024'
)

DEBUG = os.environ.get('DEBUG', 'True').lower() in ('1', 'true', 'yes')

# Railway / production hosts — comma-separated, or * for all
_raw_hosts = os.environ.get('ALLOWED_HOSTS', '*')
ALLOWED_HOSTS = [h.strip() for h in _raw_hosts.split(',') if h.strip()]

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    'api',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'api.middleware_last_seen.LastSeenMiddleware',
]

ROOT_URLCONF = 'wallet_manager.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'wallet_manager.wsgi.application'

# Prefer DATABASE_URL (Railway Postgres). Fall back to SQLite for local/dev.
_database_url = os.environ.get('DATABASE_URL')
if _database_url:
    u = urlparse(_database_url)
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': u.path.lstrip('/'),
            'USER': u.username,
            'PASSWORD': u.password,
            'HOST': u.hostname,
            'PORT': u.port or 5432,
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Karachi'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STORAGES = {
    'staticfiles': {
        'BACKEND': 'whitenoise.storage.CompressedStaticFilesStorage',
    },
}
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Disable list pagination so the frontend always receives plain arrays.
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(days=1),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=30),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': False,
    # PWA/mobile stay logged in via refresh — also stamp Django last_login on password login
    'UPDATE_LAST_LOGIN': True,
}

# CORS — set FRONTEND_URL (and optional OPS_FRONTEND_URL) in production.
# Local Vite / Expo origins are always allowed so PWA + Ops admin can hit prod API.
_LOCAL_DEV_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'http://localhost:5175',
    'http://127.0.0.1:5175',
    'http://localhost:5176',
    'http://127.0.0.1:5176',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
    'http://localhost:8081',
    'http://127.0.0.1:8081',
    'http://localhost:8082',
    'http://localhost:19006',
    'http://127.0.0.1:19006',
]
_frontend_url = os.environ.get('FRONTEND_URL', '').strip()
_ops_frontend_url = os.environ.get('OPS_FRONTEND_URL', '').strip()
_configured_origins = [
    o.strip()
    for o in f'{_frontend_url},{_ops_frontend_url}'.split(',')
    if o.strip()
]

if _configured_origins and not DEBUG:
    CORS_ALLOW_ALL_ORIGINS = False
    CORS_ALLOWED_ORIGINS = list(dict.fromkeys(_configured_origins + _LOCAL_DEV_ORIGINS))
else:
    CORS_ALLOW_ALL_ORIGINS = True

# Any localhost / 127.0.0.1 Vite port (Ops often lands on 5175 when 5174 is busy)
CORS_ALLOWED_ORIGIN_REGEXES = [
    r'^http://localhost:\d+$',
    r'^http://127\.0\.0\.1:\d+$',
]

CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = [
    'accept',
    'accept-encoding',
    'authorization',
    'content-type',
    'dnt',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
]

CSRF_TRUSTED_ORIGINS = list(dict.fromkeys(
    [
        o.strip()
        for o in os.environ.get(
            'CSRF_TRUSTED_ORIGINS',
            f'{_frontend_url},{_ops_frontend_url}',
        ).split(',')
        if o.strip()
    ]
    + _LOCAL_DEV_ORIGINS
))


# Railway / reverse-proxy HTTPS
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# Daily due-reminder cron (POST /api/jobs/due-reminders/)
CRON_SECRET = os.environ.get('CRON_SECRET', '')

# Email — set EMAIL_HOST + credentials on Railway for real delivery.
# If EMAIL_HOST is missing, use console backend so requests don't hang/500.
_email_host = os.environ.get('EMAIL_HOST', '').strip()
_default_backend = (
    'django.core.mail.backends.smtp.EmailBackend'
    if _email_host
    else 'django.core.mail.backends.console.EmailBackend'
)
EMAIL_BACKEND = os.environ.get('EMAIL_BACKEND', _default_backend)
EMAIL_HOST = _email_host
EMAIL_PORT = int(os.environ.get('EMAIL_PORT', '587') or '587')
EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER', '').strip()
# Gmail App Passwords are often pasted with spaces — strip them
EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD', '').replace(' ', '').strip()
EMAIL_USE_TLS = os.environ.get('EMAIL_USE_TLS', 'true').lower() in ('1', 'true', 'yes')
EMAIL_TIMEOUT = int(os.environ.get('EMAIL_TIMEOUT', '12') or '12')
# Prefer plain mailbox address for Gmail SMTP (display-name From often gets rejected)
_default_from = os.environ.get('DEFAULT_FROM_EMAIL', '').strip()
if not _default_from and EMAIL_HOST_USER:
    _default_from = EMAIL_HOST_USER
DEFAULT_FROM_EMAIL = _default_from or 'CashTrail <onboarding@resend.dev>'
SERVER_EMAIL = DEFAULT_FROM_EMAIL
# Optional explicit Resend key (otherwise EMAIL_HOST_PASSWORD is used when it starts with re_)
RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '').strip()

