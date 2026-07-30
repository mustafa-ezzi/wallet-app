from django.core.management.base import BaseCommand

from api.due_push import send_due_reminders


class Command(BaseCommand):
    help = 'Send Expo push reminders for payables/receivables due today (Asia/Karachi leads).'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='List candidates without sending or writing delivery logs.',
        )

    def handle(self, *args, **options):
        result = send_due_reminders(dry_run=options['dry_run'])
        self.stdout.write(
            self.style.SUCCESS(
                f"date={result['date']} candidates={result['candidates']} "
                f"sent={result['sent']} skipped={result['skipped']} failed={result['failed']} "
                f"dry_run={result['dry_run']}"
            )
        )
        for d in result.get('details') or []:
            self.stdout.write(
                f"  [{d.get('status')}] user={d.get('user_id')} {d.get('kind')}:{d.get('object_id')} "
                f"lead={d.get('lead_days')} — {d.get('title')}"
            )
