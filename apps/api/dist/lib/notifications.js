export async function createNotification(db, userId, type, title, text = "", link = "") {
    await db.run("INSERT INTO notifications (user_id, type, title, text, link, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id", [userId, type, title, text, link, Date.now()]);
}
