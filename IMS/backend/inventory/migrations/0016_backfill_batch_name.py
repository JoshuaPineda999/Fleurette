from django.db import migrations
from django.db.models import Q


def backfill_batch_names(apps, schema_editor):
    Garment = apps.get_model('inventory', 'Garment')
    SaleLog = apps.get_model('inventory', 'SaleLog')
    Expense = apps.get_model('inventory', 'Expense')

    garments = list(Garment.objects.all().order_by('id'))
    distinct_batch_names = sorted(
        {(g.batch_name or '').strip() for g in garments if (g.batch_name or '').strip()},
        key=len, reverse=True  # longest (most specific) names first
    )

    unset = Q(batch_name__isnull=True) | Q(batch_name='')

    # Best-effort: attribute each historical sale to the oldest garment batch
    # that shares its name, matching the FIFO assumption used everywhere else.
    for log in SaleLog.objects.filter(unset):
        match = next(
            (g for g in garments if g.name.strip().lower() == (log.garment_name or '').strip().lower()),
            None
        )
        if match and match.batch_name:
            log.batch_name = match.batch_name
            log.save(update_fields=['batch_name'])

    # Best-effort: same substring heuristic the analytics filter used to rely on,
    # applied once to backfill old expense records instead of on every request.
    for expense in Expense.objects.filter(unset):
        title_lower = (expense.title or '').lower()
        match = next((b for b in distinct_batch_names if b.lower() in title_lower), None)
        if match:
            expense.batch_name = match
            expense.save(update_fields=['batch_name'])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0015_expense_batch_name_salelog_batch_name'),
    ]

    operations = [
        migrations.RunPython(backfill_batch_names, noop_reverse),
    ]
