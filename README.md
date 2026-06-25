# Supabase Notes App

A simple notes app using JavaScript and Supabase.

## Database setup

1. Create a Supabase project at https://app.supabase.com.
2. Open the SQL editor.
3. Run the contents of `supabase-schema.sql`.

The schema creates a `notes` table with:
- `id` (UUID primary key)
- `user_id` (optional auth reference)
- `title`
- `content`
- `created_at`
- `updated_at`

## Frontend setup

1. Replace values in `app.js`:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`

2. Open `index.html` in your browser.

> Tip: use the Live Server VS Code extension or a simple static server for best results.

## Notes

- The app currently does not require authentication.
- If you want user-specific notes later, keep the `user_id` column and set it from Supabase auth.
- The SQL file includes an update trigger to refresh `updated_at` automatically.
