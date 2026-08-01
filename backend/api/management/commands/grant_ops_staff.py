from django.contrib.auth.models import User
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = 'Grant is_staff (Ops access) to a username. Does not print passwords.'

    def add_arguments(self, parser):
        parser.add_argument('username')
        parser.add_argument(
            '--superuser',
            action='store_true',
            help='Also set is_superuser (emergency Django admin finance access).',
        )

    def handle(self, *args, **options):
        username = options['username']
        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist as exc:
            raise CommandError(f'No user named {username!r}') from exc

        user.is_staff = True
        user.is_active = True
        update = ['is_staff', 'is_active']
        if options['superuser']:
            user.is_superuser = True
            update.append('is_superuser')
        user.save(update_fields=update)
        self.stdout.write(self.style.SUCCESS(
            f'Ops access granted to {username} (is_staff=True'
            + (', is_superuser=True' if options['superuser'] else '')
            + ').'
        ))
