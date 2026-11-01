"""Create or update the admin login from the ADMIN_USERNAME / ADMIN_PASSWORD environment variables.

Runs on every Render build (see build.bat), so changing ADMIN_PASSWORD on Render and redeploying
changes the password. Does nothing when either variable is missing.
"""
import os
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Create or update the admin user from ADMIN_USERNAME and ADMIN_PASSWORD.'

    def handle(self, *args, **options):
        username = os.environ.get('ADMIN_USERNAME', '').strip()
        password = os.environ.get('ADMIN_PASSWORD', '')
        if not username or not password:
            self.stdout.write('ensure_admin: ADMIN_USERNAME / ADMIN_PASSWORD not set, skipping.')
            return
        User = get_user_model()
        user, created = User.objects.get_or_create(username=username)
        user.is_staff = True
        user.is_superuser = True
        user.is_active = True
        user.set_password(password)
        user.save()
        self.stdout.write(f"ensure_admin: admin '{username}' {'created' if created else 'updated'}.")
