import type { Db } from "../db/index.js";

export async function createNotification(
  db: Db,
  userId: number,
  type: string,
  title: string,
  text = "",
  link = ""
) {
  await db.run(
    "INSERT INTO notifications (user_id, type, title, text, link, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
    [userId, type, title, text, link, Date.now()]
  );
}
