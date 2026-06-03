import { hashPassword } from "../security/password.js";
async function addSlots(db, garageId, daysAhead = 10, startHour = 10, endHour = 19, durationMin = 60) {
    const startDay = new Date();
    startDay.setHours(0, 0, 0, 0);
    for (let d = 0; d < daysAhead; d++) {
        const day = new Date(startDay.getTime() + d * 24 * 3600 * 1000);
        for (let h = startHour; h < endHour; h += Math.max(1, durationMin / 60)) {
            const s = new Date(day);
            s.setHours(Math.floor(h), (h % 1) * 60, 0, 0);
            const e = new Date(s.getTime() + durationMin * 60 * 1000);
            await db.run("INSERT INTO availability_slots (garage_id, start_at, end_at, is_booked) VALUES (?, ?, ?, 0) RETURNING id", [garageId, s.getTime(), e.getTime()]);
        }
    }
}
async function recalcMasterRating(db, masterUserId) {
    const rating = await db.get(`
      SELECT AVG(r.rating) as avg, COUNT(r.id) as count
      FROM reviews r
      JOIN garages g ON g.id = r.garage_id
      WHERE g.master_user_id = ?
    `, [masterUserId]);
    await db.run("UPDATE master_profiles SET rating_avg=?, rating_count=? WHERE user_id=?", [
        rating?.avg ? Number(rating.avg) : 0,
        Number(rating?.count ?? 0),
        masterUserId,
    ]);
}
export async function seed(db) {
    const now = Date.now();
    const services = [
        ["Диагностика", "Компьютерная диагностика"],
        ["Диагностика", "Выездная диагностика"],
        ["Электрика", "Ремонт автоэлектрики"],
        ["Электрика", "Поиск короткого замыкания"],
        ["Электрика", "Установка сигнализации"],
        ["Тормоза", "Замена колодок и дисков"],
        ["Подвеска", "Ремонт подвески"],
        ["ДВС", "Техническое обслуживание двигателя"],
        ["КПП", "Ремонт и замена КПП"],
        ["Кузов", "Сварка и рихтовка"],
        ["Покраска", "Локальная покраска"],
        ["Шиномонтаж", "Шиномонтаж"],
        ["Тюнинг", "Гаражный тюнинг"],
        ["Детейлинг", "Полировка и химчистка"],
    ];
    for (const [cat, name] of services) {
        await db.run("INSERT INTO services (category, name) VALUES (?, ?) RETURNING id", [cat, name]);
    }
    const serviceRows = await db.all("SELECT id, category, name FROM services");
    const serviceByName = new Map(serviceRows.map((s) => [s.name, s.id]));
    const passAdmin = hashPassword("admin123");
    const adminRes = await db.run("INSERT INTO users (role, email, password_hash, personal_data_agreed, personal_data_agreed_at, created_at) VALUES ('ADMIN', ?, ?, 1, ?, ?) RETURNING id", ["admin@example.com", passAdmin, now, now]);
    await db.run("INSERT INTO user_profiles (user_id, display_name, about, avatar_url, city, car_info, updated_at) VALUES (?, 'Администратор', 'Проверяет карточки мастерских и следит за качеством каталога.', '', 'Ульяновск', '', ?) RETURNING user_id", [Number(adminRes.lastInsertRowid), now]);
    const passUser = hashPassword("user123");
    const userRes = await db.run("INSERT INTO users (role, email, password_hash, personal_data_agreed, personal_data_agreed_at, created_at) VALUES ('USER', ?, ?, 1, ?, ?) RETURNING id", ["user@example.com", passUser, now, now]);
    const demoUserId = Number(userRes.lastInsertRowid);
    await db.run("INSERT INTO user_profiles (user_id, display_name, about, avatar_url, city, car_info, updated_at) VALUES (?, 'Алексей', 'Люблю понятный ремонт без лишних замен. Ищу мастеров по электрике, подвеске и обслуживанию.', '/images/master-sergey.jpg', 'Ульяновск', 'Lada Priora 2012', ?) RETURNING user_id", [demoUserId, now]);
    const masterPass = hashPassword("master123");
    const masters = [
        {
            email: "master@example.com",
            name: "Иван Сафонов",
            about: "Автоэлектрик с опытом 9 лет. Специализация — поиск сложных неисправностей, стартеры, генераторы, сигнализации и диагностика отечественных авто.",
            avatar: "/images/master-ivan.jpg",
            garage: {
                title: "Гараж 73 • автоэлектрика",
                address: "Ульяновск, Засвияжье, ул. Промышленная, 18",
                lat: 54.296,
                lng: 48.353,
                phone: "+7 927 000-73-01",
                cover: "/images/garage-lada-real.jpg",
                photos: ["/images/garage-lada-real.jpg", "/images/garage-lift-clean.jpg", "/images/garage-bodyshop.jpg"],
                schedule: "Пн–Сб 10:00–19:00, по записи",
                description: "Рабочий гаражный бокс без лишнего пафоса: диагностика, электрика, ремонт проводки, поиск пропадающего питания, установка допоборудования. Есть подъёмник, диагностический сканер и нормальный ручной инструмент.",
                services: [
                    ["Компьютерная диагностика", 1200, 45],
                    ["Ремонт автоэлектрики", 1800, 90],
                    ["Поиск короткого замыкания", 2500, 120],
                    ["Установка сигнализации", 4500, 180],
                ],
                approved: 1,
                demoReviews: [
                    [5, "Быстро нашёл обрыв питания, объяснил по-человечески. Машина уехала своим ходом."],
                    [5, "Приехал с проблемой по генератору, сделали без лишней замены всего подряд."],
                ],
            },
        },
        {
            email: "sergey.master@example.com",
            name: "Сергей Морозов",
            about: "Механик по ходовой и тормозам. Берёт повседневные авто, Ниву, классику, Ладу и бюджетные иномарки.",
            avatar: "/images/master-sergey.jpg",
            garage: {
                title: "Морозов Garage • подвеска и тормоза",
                address: "Ульяновск, Железнодорожный район, ул. Локомотивная, 9",
                lat: 54.315,
                lng: 48.432,
                phone: "+7 927 000-73-02",
                cover: "/images/garage-lift-clean.jpg",
                photos: ["/images/garage-lift-clean.jpg", "/images/garage-lada-real.jpg"],
                schedule: "Ежедневно 09:00–18:00",
                description: "Небольшая частная мастерская для ремонта подвески, тормозов и базового обслуживания. Упор на понятную диагностику и честное объяснение, что менять сейчас, а что можно отложить.",
                services: [
                    ["Замена колодок и дисков", 1500, 60],
                    ["Ремонт подвески", 2200, 120],
                    ["Техническое обслуживание двигателя", 2800, 120],
                    ["Шиномонтаж", 1600, 60],
                ],
                approved: 1,
                demoReviews: [[5, "Поменяли тормоза аккуратно, показали старые детали. Цена совпала с карточкой."]],
            },
        },
        {
            email: "andrey.master@example.com",
            name: "Андрей Климов",
            about: "Кузовщик. Рихтовка, сварка, подготовка под окраску, локальные ремонты после мелких ДТП.",
            avatar: "/images/master-andrey.jpg",
            garage: {
                title: "Кузовной бокс Климова",
                address: "Ульяновск, Север, Московское шоссе, 42Б",
                lat: 54.356,
                lng: 48.395,
                phone: "+7 927 000-73-03",
                cover: "/images/garage-bodyshop.jpg",
                photos: ["/images/garage-bodyshop.jpg", "/images/garage-premium-dark.jpg"],
                schedule: "Пн–Пт 11:00–20:00",
                description: "Кузовные работы в гаражном формате: сварка, рихтовка, подготовка элементов и локальная покраска. Подходит для тех, кому нужен не красивый ресепшен, а нормальный результат по делу.",
                services: [
                    ["Сварка и рихтовка", 3500, 180],
                    ["Локальная покраска", 5000, 240],
                    ["Полировка и химчистка", 3000, 120],
                ],
                approved: 1,
                demoReviews: [[4, "Нормально вытянули крыло и без сказок про невозможность ремонта."]],
            },
        },
        {
            email: "pavel.master@example.com",
            name: "Павел Рыбаков",
            about: "Тюнинг, доработки подвески, подготовка классики и Нивы под активную езду. Работает по предварительной записи.",
            avatar: "/images/master-pavel.jpg",
            garage: {
                title: "Bunker Works • тюнинг и классика",
                address: "Ульяновск, Нижняя Терраса, гаражный кооператив №4",
                lat: 54.283,
                lng: 48.495,
                phone: "+7 927 000-73-04",
                cover: "/images/garage-premium-dark.jpg",
                photos: ["/images/garage-premium-dark.jpg", "/images/garage-lada-real.jpg"],
                schedule: "Ср–Вс 12:00–21:00",
                description: "Гараж для нестандартных задач: классические Лады, подвеска, мелкий тюнинг, подготовка авто к зимней езде. В проекте показан как пример карточки с яркой специализацией.",
                services: [
                    ["Гаражный тюнинг", 3000, 180],
                    ["Ремонт подвески", 2500, 120],
                    ["Ремонт и замена КПП", 5000, 240],
                ],
                approved: 1,
                demoReviews: [[5, "После доработки подвески классика стала ехать собраннее. Под проект самое то."]],
            },
        },
        {
            email: "new.master@example.com",
            name: "Мастерская на проверке",
            about: "Мастер по диагностике и мелкому ремонту, добавивший карточку для публикации в каталоге.",
            avatar: "/images/master-ivan.jpg",
            garage: {
                title: "Гараж на Федерации",
                address: "Ульяновск, ул. Федерации, 7",
                lat: 54.31,
                lng: 48.40,
                phone: "+7 927 000-73-05",
                cover: "/images/garage-lada-real.jpg",
                photos: ["/images/garage-lada-real.jpg"],
                schedule: "По согласованию",
                description: "Частный гараж для диагностики, обслуживания и небольших срочных ремонтов. Карточка ожидает проверки администратором перед публикацией.",
                services: [["Компьютерная диагностика", 1000, 45]],
                approved: 0,
                demoReviews: [],
            },
        },
    ];
    for (const m of masters) {
        const userRes = await db.run("INSERT INTO users (role, email, password_hash, personal_data_agreed, personal_data_agreed_at, created_at) VALUES ('MASTER', ?, ?, 1, ?, ?) RETURNING id", [m.email, masterPass, now, now]);
        const masterId = Number(userRes.lastInsertRowid);
        await db.run("INSERT INTO user_profiles (user_id, display_name, about, avatar_url, city, car_info, updated_at) VALUES (?, ?, ?, ?, 'Ульяновск', '', ?) RETURNING user_id", [masterId, m.name, m.about, m.avatar, now]);
        await db.run("INSERT INTO master_profiles (user_id, display_name, about, avatar_url, rating_avg, rating_count) VALUES (?, ?, ?, ?, 0, 0)", [
            masterId,
            m.name,
            m.about,
            m.avatar,
        ]);
        const g = m.garage;
        const garageRes = await db.run(`
        INSERT INTO garages
          (master_user_id, title, address, lat, lng, description, phone, cover_url, photo_urls, work_schedule, is_approved, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
      `, [masterId, g.title, g.address, g.lat, g.lng, g.description, g.phone, g.cover, JSON.stringify(g.photos), g.schedule, g.approved, now]);
        const garageId = Number(garageRes.lastInsertRowid);
        let firstServiceId = 0;
        for (const [serviceName, price, duration] of g.services) {
            const sid = serviceByName.get(String(serviceName));
            if (sid) {
                if (!firstServiceId)
                    firstServiceId = sid;
                await db.run("INSERT INTO garage_services (garage_id, service_id, price_from, duration_min) VALUES (?, ?, ?, ?)", [garageId, sid, price, duration]);
            }
        }
        await addSlots(db, garageId, 12, 10, 19, 60);
        for (let i = 0; i < g.demoReviews.length; i++) {
            const [rating, text] = g.demoReviews[i];
            const slotStart = now - (i + 2) * 24 * 3600 * 1000;
            const slotEnd = slotStart + 60 * 60 * 1000;
            const bookingRes = await db.run("INSERT INTO bookings (user_id, garage_id, service_id, slot_start, slot_end, status, created_at) VALUES (?, ?, ?, ?, ?, 'DONE', ?) RETURNING id", [demoUserId, garageId, firstServiceId, slotStart, slotEnd, slotStart - 3600 * 1000]);
            const bookingId = Number(bookingRes.lastInsertRowid);
            await db.run("INSERT INTO reviews (booking_id, user_id, garage_id, rating, text, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id", [
                bookingId,
                demoUserId,
                garageId,
                rating,
                text,
                slotEnd + 3600 * 1000,
            ]);
        }
        await recalcMasterRating(db, masterId);
    }
    await db.run("INSERT INTO notifications (user_id, type, title, text, link, created_at) VALUES (?, 'SYSTEM', 'Добро пожаловать в GarageMaster', 'Здесь будут появляться заявки, модерация, статусы и отзывы.', '/me', ?) RETURNING id", [demoUserId, now]);
    console.log("✅ Seed applied. Demo users:");
    console.log("  admin@example.com / admin123");
    console.log("  master@example.com / master123");
    console.log("  user@example.com / user123");
}
