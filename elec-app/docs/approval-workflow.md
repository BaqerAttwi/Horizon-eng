# Project review and email notifications

Engineers submit from CRM. Submission freezes their project editing until management requests recheck or approves it. Only owner/head engineer can decide or reopen canceled projects. Quotation and further forward stage changes require internal approval.

Changing reviewed design or commercial fields invalidates internal/client approval and requires another submission. Recording client approval and updating unrelated project notes do not reset internal approval. Review events preserve previous notes, decision maker and date; existing activity-log decisions are imported by the migration.

Cancellation locks project editing and progress for every role until management reopens the project. Deleting a project remains an explicit management action. Engineers receive redacted financial fields across JSON API responses, including nested mutation responses and financial activity values.

## Deployment

Apply server/db/migrations/20261006_quotation_approval.sql and server/db/migrations/20261007_review_delivery.sql to existing databases. Both have been applied to the configured local project database. Restart the API server to load the updated routes and start the email queue worker.

The worker runs every 30 seconds. RESEND_API_KEY, EMAIL_FROM and CLIENT_URL configure the email service. Missing configuration leaves messages queued with a visible error. Missing recipient email is recorded as failed. Provider errors and timeouts retry with exponential delays for up to six attempts. Management can manually retry failed messages with a valid recipient. Accepted means the provider accepted the request, not confirmed inbox delivery. Retries use the same [Resend idempotency key](https://resend.com/changelog/idempotency-keys).

Open Review history and email status in CRM or project details to inspect events and email status. Engineers see their own tracked emails; management sees the project's tracked emails.

## Validation

Run node --test tests/*.test.js from server. Run node node_modules/vite/bin/vite.js build from client.

server/scripts/approval-flow-audit.js uses a disposable local database and does not send email. The initial October 7 run was blocked by MySQL corruption. After rebuilding MySQL from verified SQL backups, the approval API audit passed all 26 requests, including history, financial privacy, review locks, cancellation and queued email checks. Its disposable database was removed successfully. The earlier corrupt audit databases remain only in the offline recovery backup. No test email was sent.
