import type { Db } from "./index.js";

export async function createSchema(db: Db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      role TEXT NOT NULL CHECK(role IN ('ADMIN','MASTER','USER')),
      email TEXT UNIQUE,
      phone TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      personal_data_agreed INTEGER NOT NULL DEFAULT 0,
      personal_data_agreed_at BIGINT,
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      display_name TEXT DEFAULT '',
      about TEXT DEFAULT '',
      avatar_url TEXT DEFAULT '',
      city TEXT DEFAULT '',
      car_info TEXT DEFAULT '',
      updated_at BIGINT
    );

    CREATE TABLE IF NOT EXISTS master_profiles (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      display_name TEXT NOT NULL,
      about TEXT DEFAULT '',
      avatar_url TEXT DEFAULT '',
      rating_avg REAL DEFAULT 0,
      rating_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS garages (
      id SERIAL PRIMARY KEY,
      master_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      address TEXT NOT NULL,
      lat REAL,
      lng REAL,
      description TEXT DEFAULT '',
      phone TEXT,
      cover_url TEXT DEFAULT '',
      photo_urls TEXT DEFAULT '',
      work_schedule TEXT DEFAULT '',
      is_approved INTEGER NOT NULL DEFAULT 0,
      moderation_reason TEXT DEFAULT '',
      moderated_at BIGINT,
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS services (
      id SERIAL PRIMARY KEY,
      category TEXT NOT NULL,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS garage_services (
      garage_id INTEGER NOT NULL REFERENCES garages(id) ON DELETE CASCADE,
      service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      price_from INTEGER,
      duration_min INTEGER,
      PRIMARY KEY (garage_id, service_id)
    );

    CREATE TABLE IF NOT EXISTS availability_slots (
      id SERIAL PRIMARY KEY,
      garage_id INTEGER NOT NULL REFERENCES garages(id) ON DELETE CASCADE,
      start_at BIGINT NOT NULL,
      end_at BIGINT NOT NULL,
      is_booked INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      garage_id INTEGER NOT NULL REFERENCES garages(id),
      service_id INTEGER NOT NULL REFERENCES services(id),
      slot_start BIGINT NOT NULL,
      slot_end BIGINT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('NEW','CONFIRMED','CANCELLED','DONE')),
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER UNIQUE NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      from_user_id INTEGER NOT NULL REFERENCES users(id),
      text TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      read_at BIGINT
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER UNIQUE NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      garage_id INTEGER NOT NULL REFERENCES garages(id),
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      text TEXT DEFAULT '',
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL DEFAULT 'INFO',
      title TEXT NOT NULL,
      text TEXT DEFAULT '',
      link TEXT DEFAULT '',
      read_at BIGINT,
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS logbook_entries (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      booking_id INTEGER,
      title TEXT NOT NULL,
      note TEXT DEFAULT '',
      created_at BIGINT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_garages_master_user_id ON garages(master_user_id);
    CREATE INDEX IF NOT EXISTS idx_garages_approved ON garages(is_approved);
    CREATE INDEX IF NOT EXISTS idx_garages_title_address ON garages(title, address);
    CREATE INDEX IF NOT EXISTS idx_garage_services_service ON garage_services(service_id, garage_id);
    CREATE INDEX IF NOT EXISTS idx_slots_garage_start ON availability_slots(garage_id, start_at);
    CREATE INDEX IF NOT EXISTS idx_slots_booked ON availability_slots(is_booked, start_at);
    CREATE INDEX IF NOT EXISTS idx_bookings_user_created ON bookings(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_bookings_garage_status ON bookings(garage_id, status);
    CREATE INDEX IF NOT EXISTS idx_reviews_garage_created ON reviews(garage_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read_at, created_at DESC);
  `);

  await db.exec(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS personal_data_agreed INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS personal_data_agreed_at BIGINT;
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS display_name TEXT DEFAULT '';
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS about TEXT DEFAULT '';
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT '';
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS city TEXT DEFAULT '';
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS car_info TEXT DEFAULT '';
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS updated_at BIGINT;
    ALTER TABLE master_profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT '';
    ALTER TABLE garages ADD COLUMN IF NOT EXISTS cover_url TEXT DEFAULT '';
    ALTER TABLE garages ADD COLUMN IF NOT EXISTS photo_urls TEXT DEFAULT '';
    ALTER TABLE garages ADD COLUMN IF NOT EXISTS work_schedule TEXT DEFAULT '';
    ALTER TABLE garages ADD COLUMN IF NOT EXISTS moderation_reason TEXT DEFAULT '';
    ALTER TABLE garages ADD COLUMN IF NOT EXISTS moderated_at BIGINT;
  `);
}
