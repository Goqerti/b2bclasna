const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const nodemailer = require('nodemailer'); // Email kitabxanası

const app = express();
// PORT: 3030
const PORT = process.env.PORT || 3001;
const ADMIN_PASS = process.env.ADMIN_PASS || 'ClasnaPro2025!';

// --- EMAIL KONFİQURASİYASI ---
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
        user: 'telegramsirvan@gmail.com',     // Sizin email
        pass: 'bqgtrrortzzunyzs'          // Sizin App Password
    }
});

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Statik fayllar
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// --- QOVLUQLAR ---
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
const B2B_DB_FILE = path.join(DATA_DIR, 'b2b_db.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// --- HTML ROUTES ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/agent', (req, res) => res.sendFile(path.join(__dirname, 'sehife.html')));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

// ==========================================
//  DATABASE HANDLING
// ==========================================

const initialB2BDB = {
    companies: [{ id: 1, name: "General Company" }],
    regions: [{ id: 1, agentId: null, name: "Baku" }],
    hotels: [],
    operations: [],
    reservations: [],
    agents: [ 
        { id: 1, username: "admin", password: "adminpassword", name: "Administrator", email: "admin@system.com", role: "Admin", companyId: null }
    ],
    pending_agents: [] 
};

function readB2BDB() {
    let db = { ...initialB2BDB };
    if (!fs.existsSync(B2B_DB_FILE)) {
        fs.writeFileSync(B2B_DB_FILE, JSON.stringify(db, null, 2), "utf8");
    } else {
        try {
            const parsed = JSON.parse(fs.readFileSync(B2B_DB_FILE, "utf8"));
            db = { ...initialB2BDB, ...parsed };
            if(!db.companies) db.companies = [{ id: 1, name: "General Company" }];
        } catch (e) { console.error("DB Error:", e); }
    }
    return db;
}

function writeB2BDB(data) {
    fs.writeFileSync(B2B_DB_FILE, JSON.stringify(data, null, 2), "utf8");
}

// ==========================================
//  HELPER: SEND EMAIL FUNCTION
// ==========================================
async function sendReservationEmail(reservation, agentName, companyName, managerEmails) {
    if (!managerEmails || managerEmails.length === 0) return;

    const subject = `🔔 Yeni Rezervasiya: #${reservation.id} | ${companyName}`;
    
    const htmlContent = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden;">
            <div style="background-color: #1e3a8a; color: white; padding: 20px; text-align: center;">
                <h2 style="margin: 0;">Yeni Rezervasiya</h2>
            </div>
            <div style="padding: 20px;">
                <p style="font-size: 16px;">Hörmətli Menecer, sistemə yeni bir rezervasiya daxil oldu.</p>
                
                <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                    <tr style="background-color: #f9fafb;">
                        <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Agent:</strong></td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">${agentName}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Şirkət:</strong></td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">${companyName}</td>
                    </tr>
                    <tr style="background-color: #f9fafb;">
                        <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Hotel/Xidmət:</strong></td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">${reservation.summary.hotelNames || 'Qeyd yoxdur'}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Tarix:</strong></td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">${reservation.summary.checkIn} — ${reservation.summary.checkOut}</td>
                    </tr>
                    <tr style="background-color: #f9fafb;">
                        <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Qonaqlar:</strong></td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">${reservation.summary.adults} Böyük, ${reservation.summary.children} Uşaq</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Yekun Qiymət:</strong></td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee; color: #10b981; font-weight: bold;">${reservation.summary.totalPrice} $</td>
                    </tr>
                </table>

                <div style="margin-top: 20px; text-align: center;">
                    <a href="https://clasnatravel.com/login.html" style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">Admin Panelə Keç</a>
                </div>
            </div>
            <div style="background-color: #f3f4f6; padding: 10px; text-align: center; font-size: 12px; color: #6b7280;">
                B2B Booking System Notification
            </div>
        </div>
    `;

    try {
        await transporter.sendMail({
            from: '"B2B System" <sirvanback@gmail.com>',
            to: managerEmails.join(', '),
            subject: subject,
            html: htmlContent
        });
        console.log(`Email sent to: ${managerEmails.join(', ')} regarding Res #${reservation.id}`);
    } catch (error) {
        console.error("Email sending failed:", error);
    }
}

// ==========================================
//  API ROUTES
// ==========================================

app.get("/api/data", (req, res) => res.json(readB2BDB()));

// --- COMPANIES API ---
app.post("/api/companies", (req, res) => {
    const db = readB2BDB();
    const id = db.companies.length ? Math.max(...db.companies.map(c => c.id)) + 1 : 1;
    db.companies.push({ id, name: req.body.name });
    writeB2BDB(db);
    res.json({ success: true, companies: db.companies });
});

app.delete("/api/companies/:id", (req, res) => {
    const db = readB2BDB();
    const id = Number(req.params.id);
    if(id === 1) return res.status(400).json({ error: "Default şirkət silinə bilməz" });
    db.companies = db.companies.filter(c => c.id !== id);
    writeB2BDB(db);
    res.json({ success: true, companies: db.companies });
});

// --- CLONE (KOPYALAMA) API ---
app.post("/api/clone", (req, res) => {
    const db = readB2BDB();
    const { type, id, targetCompanyId } = req.body; 
    
    if (!db[type]) return res.status(400).json({ error: "Yanlış məlumat tipi" });

    const originalItem = db[type].find(i => i.id === Number(id));
    if (!originalItem) return res.status(404).json({ error: "Məlumat tapılmadı" });

    const newId = db[type].length ? Math.max(...db[type].map(i => i.id)) + 1 : 1;
    const newItem = JSON.parse(JSON.stringify(originalItem));
    
    newItem.id = newId;
    newItem.agentId = Number(targetCompanyId); 
    newItem.name = newItem.name; // Adı dəyişmirik (Copy sözü yoxdur)

    db[type].push(newItem);
    writeB2BDB(db);
    res.json({ success: true, message: "Uğurla kopyalandı!" });
});

// --- AUTH ---
app.post("/api/login", (req, res) => {
    const db = readB2BDB();
    const { username, password } = req.body;
    const agent = db.agents.find(a => a.username === username && a.password === password);
    if (agent) res.json({ 
        success: true, 
        id: agent.id, 
        name: agent.name, 
        role: agent.role, 
        username: agent.username, 
        companyId: agent.companyId 
    });
    else res.status(401).json({ success: false, error: "Yanlış məlumat" });
});

// --- SYSTEM USERS (Email ilə) ---
app.post("/api/admin/users", (req, res) => {
    const db = readB2BDB();
    const { name, username, password, role, email } = req.body;

    if(db.agents.some(a => a.username === username)) {
        return res.status(409).json({ error: "İstifadəçi adı artıq mövcuddur" });
    }

    const newUser = {
        id: Date.now(),
        name,
        username,
        password,
        email: email || "", // Email sahəsi vacibdir
        role: role, 
        companyId: null
    };

    db.agents.push(newUser);
    writeB2BDB(db);
    res.json({ success: true, message: "Sistem istifadəçisi yaradıldı" });
});

app.delete("/api/admin/users/:id", (req, res) => {
    const db = readB2BDB();
    const id = Number(req.params.id);
    if(id === 1) return res.status(400).json({ error: "Əsas Admin silinə bilməz" });
    db.agents = db.agents.filter(a => a.id !== id);
    writeB2BDB(db);
    res.json({ success: true });
});

// --- AGENT MGMT ---
app.post("/api/register", (req, res) => {
    const db = readB2BDB();
    const { username } = req.body;
    if(db.agents.some(a=>a.username===username) || db.pending_agents.some(a=>a.username===username)) {
        return res.status(409).json({ error: "Username taken" });
    }
    const id = Date.now();
    db.pending_agents.push({ id, ...req.body, role: "Agent", registeredAt: new Date().toISOString() });
    writeB2BDB(db);
    res.json({ success: true });
});

app.post("/api/agents/confirm/:id", (req, res) => {
    const db = readB2BDB();
    const idx = db.pending_agents.findIndex(a => a.id === Number(req.params.id));
    if(idx !== -1) {
        const agent = db.pending_agents[idx];
        agent.companyId = req.body.companyId ? Number(req.body.companyId) : null;
        db.agents.push(agent);
        db.pending_agents.splice(idx, 1);
        writeB2BDB(db);
        res.json({ success: true });
    } else res.status(404).json({ error: "Not found" });
});

app.put("/api/agents/:id", (req, res) => {
    const db = readB2BDB();
    const id = Number(req.params.id);
    const idx = db.agents.findIndex(a => a.id === id);
    if (idx !== -1) {
        const current = db.agents[idx];
        db.agents[idx] = {
            ...current,
            name: req.body.name || current.name,
            username: req.body.username || current.username,
            email: req.body.email || current.email,
            companyId: (req.body.companyId !== undefined) ? Number(req.body.companyId) : current.companyId,
            password: req.body.password ? req.body.password : current.password
        };
        writeB2BDB(db);
        res.json({ success: true });
    } else res.status(404).json({ error: "Not found" });
});

app.delete("/api/agents/delete/:id", (req, res) => {
    const db = readB2BDB();
    const id = Number(req.params.id);
    db.pending_agents = db.pending_agents.filter(a => a.id !== id);
    db.agents = db.agents.filter(a => a.id !== id);
    writeB2BDB(db);
    res.json({ success: true });
});

// --- CONTENT CRUD ---
app.post("/api/regions", (req, res) => {
    const db = readB2BDB();
    const id = db.regions.length ? Math.max(...db.regions.map(r => r.id)) + 1 : 1;
    db.regions.push({ id, agentId: Number(req.body.agentId), name: req.body.name });
    writeB2BDB(db); res.json({ success: true });
});
app.delete("/api/regions/:id", (req, res) => {
    const db = readB2BDB();
    db.regions = db.regions.filter(r => r.id !== Number(req.params.id));
    writeB2BDB(db); res.json({ success: true });
});
app.post("/api/hotels", (req, res) => {
    const db = readB2BDB();
    const id = db.hotels.length ? Math.max(...db.hotels.map(h => h.id)) + 1 : 1;
    const newHotel = { id, agentId: req.body.agentId ? Number(req.body.agentId) : null, ...req.body };
    db.hotels.push(newHotel); writeB2BDB(db); res.json({ success: true });
});
app.put("/api/hotels/:id", (req, res) => {
    const db = readB2BDB();
    const id = Number(req.params.id);
    const index = db.hotels.findIndex(h => h.id === id);
    if (index !== -1) {
        db.hotels[index] = { ...db.hotels[index], ...req.body, id: id };
        writeB2BDB(db); res.json({ success: true });
    } else res.status(404).json({ error: "Not found" });
});
app.delete("/api/hotels/:id", (req, res) => {
    const db = readB2BDB();
    db.hotels = db.hotels.filter(h => h.id !== Number(req.params.id));
    writeB2BDB(db); res.json({ success: true });
});
app.post("/api/operations", (req, res) => {
    const db = readB2BDB();
    const id = db.operations.length ? Math.max(...db.operations.map(o => o.id)) + 1 : 1;
    db.operations.push({ id, agentId: req.body.agentId ? Number(req.body.agentId) : null, ...req.body });
    writeB2BDB(db); res.json({ success: true });
});
app.delete("/api/operations/:id", (req, res) => {
    const db = readB2BDB();
    db.operations = db.operations.filter(o => o.id !== Number(req.params.id));
    writeB2BDB(db); res.json({ success: true });
});

// --- RESERVATIONS & EMAIL ---
app.post("/api/reservations", (req, res) => {
    const db = readB2BDB();
    const id = db.reservations.length ? Math.max(...db.reservations.map(r => r.id)) + 1 : 1001; 
    
    const newRes = { id, date: new Date().toISOString(), ...req.body };
    db.reservations.push(newRes);
    writeB2BDB(db);

    // 1. Agent Məlumatı
    const agent = db.agents.find(a => a.username === newRes.submittingAgentUsername);
    let companyName = "General Company"; // Default
    if (agent && agent.companyId) {
        const comp = db.companies.find(c => c.id === agent.companyId);
        if (comp) companyName = comp.name;
    }

    // 2. Email Göndəriləcək Menecerləri Tap (ResManager)
    const managers = db.agents.filter(a => a.role === 'ResManager' && a.email);
    const managerEmails = managers.map(m => m.email);

    // 3. Email Göndər
    if (managerEmails.length > 0) {
        sendReservationEmail(newRes, newRes.submittingAgentUsername, companyName, managerEmails);
    }

    res.json({ message: "Reservation saved", id });
});

app.put("/api/reservations/status/:id", (req, res) => {
    const db = readB2BDB();
    const r = db.reservations.find(x => x.id === Number(req.params.id));
    if(r) {
        r.status = req.body.status;
        if(req.body.changeRequest) r.changeRequest = req.body.changeRequest;
        else if(['Confirmed','Processing','Cancelled','Admin Check'].includes(r.status)) r.changeRequest = null;
        writeB2BDB(db); res.json({ success: true });
    } else res.status(404).json({error: "Not found"});
});

app.put("/api/reservations/:id", (req, res) => {
    const db = readB2BDB();
    const idx = db.reservations.findIndex(x => x.id === Number(req.params.id));
    if(idx !== -1) {
        if(req.body.summaryUpdate) { 
             db.reservations[idx].summary.checkIn = req.body.summaryUpdate.checkIn;
             db.reservations[idx].summary.checkOut = req.body.summaryUpdate.checkOut;
        }
        if(req.body.status) db.reservations[idx].status = req.body.status;
        if(req.body.changeRequest === null) db.reservations[idx].changeRequest = null;
        writeB2BDB(db); res.json({ success: true });
    } else res.status(404).json({error: "Not found"});
});

app.delete("/api/reservations/:id", (req, res) => {
    const db = readB2BDB();
    db.reservations = db.reservations.filter(r => r.id !== Number(req.params.id));
    writeB2BDB(db); res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`Clasna Unified Server Running on http://localhost:${PORT}`);
});