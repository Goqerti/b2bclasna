const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const nodemailer = require('nodemailer'); 
const mongoose = require('mongoose'); 
const puppeteer = require('puppeteer'); 
const TelegramBot = require('node-telegram-bot-api');

const app = express();
// PORT: 3030
const PORT = process.env.PORT || 3001;
const ADMIN_PASS = process.env.ADMIN_PASS || 'ClasnaPro2025!';

// ==========================================
// TELEGRAM BOT AYARLARI 
// ==========================================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || 'BURAYA_BOTFATHER_TOKENINIZI_YAZIN';
const RES_GROUP_ID = process.env.RES_GROUP_ID || 'BURAYA_REZERVASIYA_QRUPUNUN_ID_YAZIN'; 
const AGENT_GROUP_ID = process.env.AGENT_GROUP_ID || 'BURAYA_AGENT_QRUPUNUN_ID_YAZIN'; 

// --- MONGODB KONFİQURASİYASI ---
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://sirvan:sirvan.111.111@cluster0.yqc6lrw.mongodb.net/?appName=Cluster0';
const schemaOptions = { strict: false, versionKey: false };

const Company = mongoose.model('Company', new mongoose.Schema({ id: Number }, schemaOptions));
const Region = mongoose.model('Region', new mongoose.Schema({ id: Number }, schemaOptions));
const Hotel = mongoose.model('Hotel', new mongoose.Schema({ id: Number }, schemaOptions));
const Operation = mongoose.model('Operation', new mongoose.Schema({ id: Number }, schemaOptions));
const Reservation = mongoose.model('Reservation', new mongoose.Schema({ id: Number }, schemaOptions));
const Agent = mongoose.model('Agent', new mongoose.Schema({ id: Number }, schemaOptions));
const PendingAgent = mongoose.model('PendingAgent', new mongoose.Schema({ id: Number }, schemaOptions));

// --- BAZANIN İLKİN (DEFAULT) MƏLUMATLARLA DOLDURULMASI ---
async function initDB() {
    try {
        if ((await Company.countDocuments()) === 0) {
            await Company.create({ id: 1, name: "General Company" });
            console.log("✅ Default Company yaradıldı.");
        }
        if ((await Region.countDocuments()) === 0) {
            await Region.create({ id: 1, agentId: null, name: "Baku" });
            console.log("✅ Default Region yaradıldı.");
        }
        if ((await Agent.countDocuments()) === 0) {
            await Agent.create({ id: 1, username: "admin", password: "adminpassword", name: "Administrator", email: "admin@system.com", role: "Admin", companyId: null });
            console.log("✅ Default Admin yaradıldı.");
        }
        console.log("✅ Verilənlər bazası hazırdır.");
    } catch (e) {
        console.error("❌ İlkin məlumatların yüklənməsi zamanı xəta:", e);
    }
}

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('✅ MongoDB bağlantısı uğurla quruldu!');
        initDB(); 
    })
    .catch(err => console.error('❌ MongoDB bağlantı xətası:', err));

// --- EMAIL KONFİQURASİYASI ---
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: 'telegramsirvan@gmail.com',     
        pass: 'bqgtrrortzzunyzs'          
    }
});

transporter.verify(function(error, success) {
    if (error) { console.error('❌ [EMAIL INIT ERROR]', error); } 
    else { console.log('✅ [EMAIL INIT SUCCESS] Sistem e-poçt göndərməyə hazırdır.'); }
});

// ==========================================
// TELEGRAM BOT İDARƏETMƏSİ VƏ CALLBACK-LƏR
// ==========================================
let bot;
try {
    if (TELEGRAM_TOKEN !== 'BURAYA_BOTFATHER_TOKENINIZI_YAZIN') {
        bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
        console.log('✅ Telegram Bot aktiv edildi və dinləyir.');

        bot.on('callback_query', async (query) => {
            const data = query.data;
            const chatId = query.message.chat.id;
            const messageId = query.message.message_id;

            try {
                if (data.startsWith('approve_agent_')) {
                    const agentId = Number(data.split('_')[2]);
                    const companies = await Company.find({}, '-_id').lean();
                    
                    let keyboard = [];
                    let row = [];
                    companies.forEach((comp, index) => {
                        row.push({ text: comp.name, callback_data: `assign_comp_${agentId}_${comp.id}` });
                        if (row.length === 2 || index === companies.length - 1) {
                            keyboard.push(row);
                            row = [];
                        }
                    });
                    
                    bot.editMessageText(`Məlumatlar yoxlanılır...\nZəhmət olmasa agentin aid olacağı şirkəti seçin:\n\n${query.message.text}`, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: { inline_keyboard: keyboard }
                    });
                    
                } 
                else if (data.startsWith('reject_agent_')) {
                    const agentId = Number(data.split('_')[2]);
                    await PendingAgent.deleteOne({ id: agentId });
                    
                    bot.editMessageText(`❌ Agent sorğusu ləğv edildi və silindi.\n\n~~ Gələn Sorğu ~~\n${query.message.text}`, {
                        chat_id: chatId,
                        message_id: messageId
                    });
                } 
                else if (data.startsWith('assign_comp_')) {
                    const parts = data.split('_');
                    const agentId = Number(parts[2]);
                    const compId = Number(parts[3]);
                    
                    const agent = await PendingAgent.findOne({ id: agentId }).lean();
                    if (agent) {
                        agent.companyId = compId;
                        delete agent._id;
                        
                        await Agent.create(agent);
                        await PendingAgent.deleteOne({ id: agentId });
                        
                        const comp = await Company.findOne({id: compId}).lean();
                        const compName = comp ? comp.name : 'Naməlum Şirkət';
                        
                        if (agent.email) {
                            await sendAgentWelcomeEmail(agent);
                        }
                        
                        bot.editMessageText(`✅ Agent uğurla təsdiqləndi!\n🏢 Təyin edilən şirkət: <b>${compName}</b>\n📧 Xoşgəldin (Premium) məktubu Agentə göndərildi.\n\n~~ İlkin Sorğu ~~\n${query.message.text.split('Zəhmət olmasa')[0]}`, {
                            chat_id: chatId,
                            message_id: messageId,
                            parse_mode: 'HTML'
                        });
                    } else {
                        bot.sendMessage(chatId, "⚠️ Agent tapılmadı. Ola bilsin ki, artıq təsdiqlənib və ya rədd edilib.");
                    }
                }
                
                bot.answerCallbackQuery(query.id);
            } catch (e) {
                console.error("Telegram callback error:", e);
                bot.answerCallbackQuery(query.id, { text: "Xəta baş verdi!", show_alert: true });
            }
        });
    } else {
        console.log('⚠️ Telegram Bot Tokeni təyin edilməyib, Telegram funksiyaları işləməyəcək.');
    }
} catch(e) {
    console.log('⚠️ Telegram Bot Error:', e);
}


// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// --- HTML ROUTES ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/agent', (req, res) => res.sendFile(path.join(__dirname, 'sehife.html')));
// YENİ: baza.html rolu
app.get('/baza', (req, res) => res.sendFile(path.join(__dirname, 'baza.html')));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

// ==========================================
//  HELPER: SEND EMAIL FUNCTIONS
// ==========================================

async function sendAgentWelcomeEmail(agentObj) {
    if (!agentObj || !agentObj.email) return;

    const subject = `✅ Your Account is Approved - Welcome to B2B Booking System`;
    
    const htmlContent = `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
            <div style="background-color: #1e3a8a; color: #ffffff; padding: 35px 20px; text-align: center;">
                <h2 style="margin: 0; font-size: 26px; font-weight: 900; letter-spacing: 1px;">WELCOME TO B2B SYSTEM</h2>
                <p style="margin: 10px 0 0 0; font-size: 15px; color: #bfdbfe;">Your account has been officially approved!</p>
            </div>
            <div style="padding: 40px 30px;">
                <p style="font-size: 16px; line-height: 1.6; margin-top: 0;">Dear <b>${agentObj.name}</b>,</p>
                <p style="font-size: 16px; line-height: 1.6; color: #475569;">We are thrilled to inform you that your registration for the <b>B2B Professional Booking System</b> has been successfully reviewed and approved by our administration team.</p>
                
                <div style="background-color: #f8fafc; border-left: 5px solid #10b981; padding: 25px; margin: 30px 0; border-radius: 0 8px 8px 0; border-top: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;">
                    <h3 style="margin: 0 0 20px 0; color: #0f172a; font-size: 15px; text-transform: uppercase; letter-spacing: 0.5px;">Your Login Credentials</h3>
                    <table style="width: 100%; font-size: 16px; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 10px 0; color: #64748b; width: 110px; border-bottom: 1px dashed #cbd5e1;">Username:</td>
                            <td style="padding: 10px 0; font-weight: 800; color: #1e293b; border-bottom: 1px dashed #cbd5e1;">${agentObj.username}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px 0; color: #64748b;">Password:</td>
                            <td style="padding: 10px 0; font-weight: 800; color: #1e293b;">${agentObj.password}</td>
                        </tr>
                    </table>
                </div>

                <p style="font-size: 16px; line-height: 1.6; color: #475569;">You can now log in to the console to start searching, configuring, and booking services instantly.</p>

                <div style="text-align: center; margin: 40px 0 20px 0;">
                    <a href="https://clasnatravel.com/login.html" style="background-color: #10b981; color: #ffffff; padding: 15px 35px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 4px 10px rgba(16, 185, 129, 0.3); transition: background-color 0.3s;">Login to Console</a>
                </div>
                
                <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
                    <i>For security reasons, please keep your credentials confidential. If you did not request this account, please contact our support team immediately.</i>
                </p>
            </div>
        </div>
    `;

    try {
        await transporter.sendMail({
            from: '"B2B System" <telegramsirvan@gmail.com>',
            to: agentObj.email,
            subject: subject,
            html: htmlContent
        });
        console.log(`✅ [EMAIL SUCCESS] Xoşgəldin (Welcome) məktubu agentə uğurla göndərildi: ${agentObj.email}`);
    } catch (error) {
        console.error(`❌ [EMAIL ERROR] Agentə (${agentObj.email}) xoşgəldin məktubu göndərilə bilmədi:`, error);
    }
}

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
            from: '"B2B System" <telegramsirvan@gmail.com>',
            to: managerEmails.join(', '),
            subject: subject,
            html: htmlContent
        });
        console.log(`✅ [EMAIL SUCCESS] Yeni rezervasiya (#${reservation.id}) barədə menecerlərə məktub göndərildi: ${managerEmails.join(', ')}`);
    } catch (error) {
        console.error(`❌ [EMAIL ERROR] Yeni rezervasiya (#${reservation.id}) məktubu göndərilə bilmədi:`, error);
    }
}

async function sendHotelConfirmationEmail(reservation, hotelObj) {
    if (!hotelObj.email) return;

    const subject = `✅ Yeni Rezervasiya Təsdiqi: #${reservation.id} | B2B Booking System`;
    
    const hotelRooms = reservation.summary.rooms ? reservation.summary.rooms.filter(rm => rm.hotelName.trim() === hotelObj.name.trim()) : [];
    let roomDetailsHtml = hotelRooms.map(rm => `<li style="margin-bottom: 5px;">${rm.roomName}</li>`).join('');
    if (!roomDetailsHtml) roomDetailsHtml = `<li>${reservation.summary.hotelNames}</li>`;

    let guestsHtml = (reservation.travelers || []).map(t => `<li style="margin-bottom: 5px;">${t.name} ${t.surname} (${t.type}) - ${t.nationality || ''}</li>`).join('');

    const htmlContent = `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; margin: 0 auto;">
            <div style="background-color: #10b981; color: white; padding: 20px; text-align: center;">
                <h2 style="margin: 0;">Rezervasiya Təsdiqləndi</h2>
            </div>
            <div style="padding: 20px;">
                <p style="font-size: 16px;">Hörmətli <b>${hotelObj.name}</b> rəhbərliyi,</p>
                <p>Sistemimizdən sizə yeni bir rezervasiya təsdiqlənmişdir. Zəhmət olmasa detalları yoxlayın:</p>
                
                <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                    <tr style="background-color: #f9fafb;">
                        <td style="padding: 10px; border-bottom: 1px solid #eee; width: 35%;"><strong>Rezervasiya Nömrəsi:</strong></td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">#${reservation.id}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Giriş (Check-in):</strong></td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee; color: #3b82f6; font-weight: bold;">${reservation.summary.checkIn}</td>
                    </tr>
                    <tr style="background-color: #f9fafb;">
                        <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Çıxış (Check-out):</strong></td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee; color: #ef4444; font-weight: bold;">${reservation.summary.checkOut}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Gecə Sayı:</strong></td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">${reservation.summary.nights} Gecə</td>
                    </tr>
                    <tr style="background-color: #f9fafb;">
                        <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Qonaq Sayı:</strong></td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">${reservation.summary.adults} Böyük, ${reservation.summary.children} Uşaq</td>
                    </tr>
                </table>

                <h3 style="margin-top: 25px; color: #1e3a8a; border-bottom: 2px solid #e5e7eb; padding-bottom: 5px;">Seçilmiş Otaqlar</h3>
                <ul style="padding-left: 20px;">${roomDetailsHtml}</ul>

                <h3 style="margin-top: 25px; color: #1e3a8a; border-bottom: 2px solid #e5e7eb; padding-bottom: 5px;">Qonaqların Siyahısı</h3>
                <ul style="padding-left: 20px;">${guestsHtml}</ul>

                <p style="margin-top: 30px; font-size: 13px; color: #6b7280;">Hər hansı bir sualınız yaranarsa, zəhmət olmasa bizimlə əlaqə saxlayın.</p>
            </div>
            <div style="background-color: #f3f4f6; padding: 15px; text-align: center; font-size: 12px; color: #6b7280;">
                Təşəkkürlər,<br><b>B2B Booking System</b>
            </div>
        </div>
    `;

    try {
        await transporter.sendMail({
            from: '"B2B System" <telegramsirvan@gmail.com>',
            to: hotelObj.email,
            subject: subject,
            html: htmlContent
        });
        console.log(`✅ [EMAIL SUCCESS] Təsdiq məktubu hotelə uğurla göndərildi: ${hotelObj.name} (${hotelObj.email}) | Res #${reservation.id}`);
    } catch (error) {
        console.error(`❌ [EMAIL ERROR] Hotelə (${hotelObj.name}) təsdiq məktubu göndərilə bilmədi | Res #${reservation.id}:`, error);
    }
}

async function sendAgentVoucherEmail(reservation, agentObj) {
    if (!agentObj || !agentObj.email) return;

    const summary = reservation.summary;
    const travelers = reservation.travelers || [];
    const flightInfo = reservation.flightInfo || {};
    
    let roomsHtml = (summary.rooms && summary.rooms.length > 0) 
        ? summary.rooms.map(rm => `<li><b>${rm.roomName.split(' - ')[0]}</b> - ${rm.roomName.substring(rm.roomName.indexOf(' - ') + 3)}</li>`).join('') 
        : `<li>${summary.hotelNames}</li>`;

    let travelersHtml = travelers.map((t, idx) => `
        <tr>
            <td style="padding: 10px 15px; border: 1px solid #cbd5e1;">${idx + 1}</td>
            <td style="padding: 10px 15px; border: 1px solid #cbd5e1; font-weight: bold;">${t.name} ${t.surname}</td>
            <td style="padding: 10px 15px; border: 1px solid #cbd5e1;">${t.type}</td>
            <td style="padding: 10px 15px; border: 1px solid #cbd5e1;">${t.dob}</td>
            <td style="padding: 10px 15px; border: 1px solid #cbd5e1;">${t.nationality}</td>
        </tr>
    `).join('');

    const voucherHTML = `
        <html>
        <head>
            <style>
                @media print {
                    .no-print { display: none; }
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
            </style>
        </head>
        <body style="margin: 0; padding: 0; background: #ffffff;">
            <div style="padding: 40px 50px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; background: #ffffff; width: 100%; box-sizing: border-box;">
               <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px;">
                   <div>
                       <h1 style="margin: 0; color: #1e3a8a; font-size: 36px; font-weight: 900; letter-spacing: 1px;">BOOKING VOUCHER</h1>
                       <p style="margin: 5px 0 0 0; color: #64748b; font-size: 14px; text-transform: uppercase; font-weight: 600;">B2B Professional Booking System</p>
                   </div>
                   <div style="text-align: right;">
                       <div style="font-size: 20px; font-weight: bold; color: #64748b;">Booking ID</div>
                       <div style="font-size: 28px; font-weight: 900; color: #ef4444;">#${reservation.id}</div>
                       <div style="font-size: 13px; color: #94a3b8; margin-top: 5px;">Date: ${new Date().toLocaleDateString('en-GB')}</div>
                   </div>
               </div>

               <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 30px; border-left: 6px solid #3b82f6;">
                   <h3 style="margin: 0 0 15px 0; color: #0f172a; font-size: 16px; text-transform: uppercase;">Agency Information</h3>
                   <table style="width: 100%; font-size: 14px;">
                       <tr>
                           <td style="padding: 5px 0; width: 50%;"><b>Agent:</b> ${agentObj.name}</td>
                           <td style="padding: 5px 0; width: 50%;"><b>Ref Number:</b> ${summary.agentResNumber || 'N/A'}</td>
                       </tr>
                   </table>
               </div>

               <h3 style="color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 15px; font-size: 18px;">Travel Details</h3>
               <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 14px; text-align: left;">
                   <thead>
                       <tr style="background: #eff6ff; color: #1e3a8a;">
                           <th style="padding: 12px 15px; border: 1px solid #bfdbfe;">Check-in</th>
                           <th style="padding: 12px 15px; border: 1px solid #bfdbfe;">Check-out</th>
                           <th style="padding: 12px 15px; border: 1px solid #bfdbfe;">Nights</th>
                           <th style="padding: 12px 15px; border: 1px solid #bfdbfe;">Guests</th>
                       </tr>
                   </thead>
                   <tbody>
                       <tr>
                           <td style="padding: 12px 15px; border: 1px solid #e2e8f0; font-weight: bold; color: #10b981;">${summary.checkIn}</td>
                           <td style="padding: 12px 15px; border: 1px solid #e2e8f0; font-weight: bold; color: #ef4444;">${summary.checkOut}</td>
                           <td style="padding: 12px 15px; border: 1px solid #e2e8f0; font-weight: bold;">${summary.nights}</td>
                           <td style="padding: 12px 15px; border: 1px solid #e2e8f0;">${summary.adults} Adult(s), ${summary.children} Child(ren)</td>
                       </tr>
                   </tbody>
               </table>

               <h3 style="color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 15px; font-size: 18px;">Accommodation (Hotels & Rooms)</h3>
               <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin-bottom: 30px;">
                   <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #334155; line-height: 1.8;">
                       ${roomsHtml}
                   </ul>
               </div>

               <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
                   <tr>
                       <td style="width: 50%; padding-right: 15px; vertical-align: top;">
                           <h3 style="color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 15px; font-size: 16px;">Transfer Service</h3>
                           <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; font-size: 14px; color: #334155; min-height: 80px;">
                               ${summary.operationsInfo || '<i>No transfer selected</i>'}
                           </div>
                       </td>
                       <td style="width: 50%; padding-left: 15px; vertical-align: top;">
                           <h3 style="color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 15px; font-size: 16px;">Flight Information</h3>
                           <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; font-size: 14px; color: #334155; min-height: 80px;">
                               ${flightInfo && flightInfo.flightNumber ? `
                                   <div style="margin-bottom: 5px;"><b>Flight No:</b> ${flightInfo.flightNumber}</div>
                                   <div style="margin-bottom: 5px;"><b>Arrival:</b> ${flightInfo.arrival}</div>
                                   <div><b>Departure:</b> ${flightInfo.departure}</div>
                               ` : '<i>No flight details provided</i>'}
                           </div>
                       </td>
                   </tr>
               </table>

               <h3 style="color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 15px; font-size: 18px;">Guest List</h3>
               <table style="width: 100%; border-collapse: collapse; margin-bottom: 40px; font-size: 14px; text-align: left;">
                   <thead>
                       <tr style="background: #f1f5f9; color: #334155;">
                           <th style="padding: 10px 15px; border: 1px solid #cbd5e1;">#</th>
                           <th style="padding: 10px 15px; border: 1px solid #cbd5e1;">Full Name</th>
                           <th style="padding: 10px 15px; border: 1px solid #cbd5e1;">Type</th>
                           <th style="padding: 10px 15px; border: 1px solid #cbd5e1;">Date of Birth</th>
                           <th style="padding: 10px 15px; border: 1px solid #cbd5e1;">Nationality</th>
                       </tr>
                   </thead>
                   <tbody>
                       ${travelersHtml}
                   </tbody>
               </table>

               <div style="background: #ecfdf5; border: 2px solid #10b981; border-radius: 12px; padding: 25px; display: flex; justify-content: space-between; align-items: center; page-break-inside: avoid;">
                   <div>
                       <div style="font-size: 14px; color: #047857; font-weight: bold; text-transform: uppercase; margin-bottom: 5px;">Status</div>
                       <div style="font-size: 20px; color: #059669; font-weight: 900; letter-spacing: 1px; padding: 5px 15px; background: #d1fae5; border-radius: 8px; display: inline-block;">CONFIRMED</div>
                   </div>
               </div>
               
               <div style="margin-top: 50px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 2px dashed #e2e8f0; padding-top: 20px; page-break-inside: avoid;">
                   <b>B2B Professional Booking System</b><br>
                   This document is automatically generated by the system.<br>
                   <i>Thank you for choosing us! Have a pleasant journey!</i>
               </div>
            </div>
        </body>
        </html>
    `;

    try {
        const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.setContent(voucherHTML, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '0px', bottom: '0px', left: '0px', right: '0px' } });
        await browser.close();

        const mailOptions = {
            from: '"B2B Booking System" <telegramsirvan@gmail.com>',
            to: agentObj.email,
            subject: `✅ Reservation Confirmed: #${reservation.id}`,
            text: `Dear ${agentObj.name}, your reservation #${reservation.id} has been confirmed. Please find your voucher attached.`,
            html: `<p>Dear <b>${agentObj.name}</b>,</p><p>Your reservation <b>#${reservation.id}</b> has been successfully <b>Confirmed</b>.</p><p>Please find the official booking voucher attached to this email.</p><br><p>Best regards,<br>B2B Booking System</p>`,
            attachments: [
                {
                    filename: `Booking_Voucher_${reservation.id}.pdf`,
                    content: pdfBuffer,
                    contentType: 'application/pdf'
                }
            ]
        };

        await transporter.sendMail(mailOptions);
        console.log(`✅ [EMAIL SUCCESS] PDF Vouçer agentə uğurla göndərildi: ${agentObj.email} | Res #${reservation.id}`);
    } catch (error) {
        console.error(`❌ [EMAIL ERROR / PDF ERROR] Agentə (${agentObj.email}) vouçer göndərilməsi və ya PDF yaradılması zamanı xəta | Res #${reservation.id}:`, error);
    }
}

// ==========================================
//  API ROUTES
// ==========================================

app.get("/api/data", async (req, res) => {
    try {
        const [companies, regions, hotels, operations, reservations, agents, pending_agents] = await Promise.all([
            Company.find({}, '-_id').lean(),
            Region.find({}, '-_id').lean(),
            Hotel.find({}, '-_id').lean(),
            Operation.find({}, '-_id').lean(),
            Reservation.find({}, '-_id').lean(),
            Agent.find({}, '-_id').lean(),
            PendingAgent.find({}, '-_id').lean()
        ]);
        res.json({ companies, regions, hotels, operations, reservations, agents, pending_agents });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Baza xətası yarandı" });
    }
});

// ==========================================
// BAZA.HTML ÜÇÜN XÜSUSİ API-LƏR (YENİ)
// ==========================================

// Bütün kolleksiyaları _id ilə birlikdə gətirən yol (Redaktə etmək üçün Mongoose-a mütləq _id lazımdır)
app.get('/api/db/all', async (req, res) => {
    try {
        const companies = await Company.find().lean();
        const regions = await Region.find().lean();
        const hotels = await Hotel.find().lean();
        const operations = await Operation.find().lean();
        const reservations = await Reservation.find().lean();
        const agents = await Agent.find().lean();
        const pending_agents = await PendingAgent.find().lean();
        res.json({ companies, regions, hotels, operations, reservations, agents, pending_agents });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

function getModelByName(name) {
    switch(name) {
        case 'companies': return Company;
        case 'regions': return Region;
        case 'hotels': return Hotel;
        case 'operations': return Operation;
        case 'reservations': return Reservation;
        case 'agents': return Agent;
        case 'pending_agents': return PendingAgent;
        default: throw new Error("Kolleksiya tapılmadı");
    }
}

// JSON redaktəsi vasitəsilə məlumatın yenilənməsi
app.put('/api/db/update/:collection/:id', async (req, res) => {
    try {
        const { collection, id } = req.params;
        const updateData = req.body;
        
        // _id dəyişdirilə bilməz, ona görə bədəndən silirik
        delete updateData._id; 
        
        let Model = getModelByName(collection);
        await Model.updateOne({ _id: id }, { $set: updateData });
        res.json({success: true});
    } catch(e) { 
        res.status(500).json({error: e.message}); 
    }
});

// Sənədin silinməsi
app.delete('/api/db/delete/:collection/:id', async (req, res) => {
    try {
        const { collection, id } = req.params;
        let Model = getModelByName(collection);
        await Model.deleteOne({ _id: id });
        res.json({success: true});
    } catch(e) { 
        res.status(500).json({error: e.message}); 
    }
});

// BÜTÜN BAZANIN SIFIRLANMASI DÜYMƏSİ ÜÇÜN
app.post('/api/db/reset', async (req, res) => {
    try {
        // Bütün kolleksiyaların təmizlənməsi
        await Company.deleteMany({});
        await Region.deleteMany({});
        await Hotel.deleteMany({});
        await Operation.deleteMany({});
        await Reservation.deleteMany({});
        await Agent.deleteMany({});
        await PendingAgent.deleteMany({});
        
        // Admin, Global Company kimi mütləq lazım olan məlumatların yenidən yaradılması
        await initDB();
        
        res.json({success: true, message: "Baza tam sıfırlandı və default məlumatlar yaradıldı."});
    } catch(e) { 
        res.status(500).json({error: e.message}); 
    }
});

// --- STANDART API-LƏR DAVAM EDİR ---

app.post("/api/companies", async (req, res) => {
    try {
        const max = await Company.findOne().sort('-id');
        const id = max ? max.id + 1 : 1;
        await Company.create({ id, name: req.body.name });
        
        const companies = await Company.find({}, '-_id').lean();
        res.json({ success: true, companies });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete("/api/companies/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        if(id === 1) return res.status(400).json({ error: "Default şirkət silinə bilməz" });
        
        await Company.deleteOne({ id });
        const companies = await Company.find({}, '-_id').lean();
        res.json({ success: true, companies });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/clone", async (req, res) => {
    try {
        const { type, id, targetCompanyId } = req.body; 
        
        let Model;
        if (type === 'companies') Model = Company;
        else if (type === 'regions') Model = Region;
        else if (type === 'hotels') Model = Hotel;
        else if (type === 'operations') Model = Operation;
        else return res.status(400).json({ error: "Yanlış məlumat tipi" });

        const originalItem = await Model.findOne({ id: Number(id) }, '-_id').lean();
        if (!originalItem) return res.status(404).json({ error: "Məlumat tapılmadı" });

        const max = await Model.findOne().sort('-id');
        const newId = max ? max.id + 1 : 1;
        
        const newItem = { ...originalItem, id: newId, agentId: Number(targetCompanyId) };
        await Model.create(newItem);

        res.json({ success: true, message: "Uğurla kopyalandı!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/login", async (req, res) => {
    try {
        const { username, password } = req.body;
        const agent = await Agent.findOne({ username, password }).lean();
        
        if (agent) {
            res.json({ 
                success: true, 
                id: agent.id, 
                name: agent.name, 
                role: agent.role, 
                username: agent.username, 
                companyId: agent.companyId 
            });
        } else {
            res.status(401).json({ success: false, error: "Yanlış məlumat" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/admin/users", async (req, res) => {
    try {
        const { name, username, password, role, email } = req.body;

        const exists = await Agent.findOne({ username }).lean();
        if(exists) {
            return res.status(409).json({ error: "İstifadəçi adı artıq mövcuddur" });
        }

        const newUser = {
            id: Date.now(),
            name,
            username,
            password,
            email: email || "", 
            role: role, 
            companyId: null
        };

        await Agent.create(newUser);
        res.json({ success: true, message: "Sistem istifadəçisi yaradıldı" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete("/api/admin/users/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        if(id === 1) return res.status(400).json({ error: "Əsas Admin silinə bilməz" });
        await Agent.deleteOne({ id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/register", async (req, res) => {
    try {
        const { username, name, email, company } = req.body;
        const existsAgent = await Agent.findOne({ username }).lean();
        const existsPending = await PendingAgent.findOne({ username }).lean();

        if(existsAgent || existsPending) {
            return res.status(409).json({ error: "Username taken" });
        }

        const id = Date.now();
        await PendingAgent.create({ id, ...req.body, role: "Agent", registeredAt: new Date().toISOString() });
        res.json({ success: true });

        if (bot && AGENT_GROUP_ID && AGENT_GROUP_ID !== 'BURAYA_AGENT_QRUPUNUN_ID_YAZIN') {
            let agentMsg = `👤 <b>YENİ AGENT QEYDİYYAT SORĞUSU</b>\n\n`;
            agentMsg += `📝 <b>Ad Soyad:</b> ${name}\n`;
            agentMsg += `🆔 <b>İstifadəçi Adı:</b> ${username}\n`;
            agentMsg += `📧 <b>Email:</b> ${email || '-'}\n`;
            agentMsg += `🏢 <b>Şirkət Adı (Agentin qeydi):</b> ${company || '-'}\n`;
            
            bot.sendMessage(AGENT_GROUP_ID, agentMsg, { 
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "✅ Təsdiqlə", callback_data: `approve_agent_${id}` },
                            { text: "❌ Rədd et", callback_data: `reject_agent_${id}` }
                        ]
                    ]
                }
            }).catch(err => console.error("Telegram Agent bildirişi xətası:", err));
        }

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/agents/confirm/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        const agent = await PendingAgent.findOne({ id }).lean();
        
        if(agent) {
            agent.companyId = req.body.companyId ? Number(req.body.companyId) : null;
            delete agent._id; 
            
            await Agent.create(agent);
            await PendingAgent.deleteOne({ id });
            
            if (agent.email) {
                await sendAgentWelcomeEmail(agent);
            }
            
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "Not found" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put("/api/agents/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        const agent = await Agent.findOne({ id });
        
        if (agent) {
            const updateData = {
                name: req.body.name || agent.name,
                username: req.body.username || agent.username,
                email: req.body.email || agent.email,
                companyId: (req.body.companyId !== undefined) ? Number(req.body.companyId) : agent.companyId,
                password: req.body.password ? req.body.password : agent.password
            };
            await Agent.updateOne({ id }, { $set: updateData });
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "Not found" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete("/api/agents/delete/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        await Promise.all([
            Agent.deleteOne({ id }),
            PendingAgent.deleteOne({ id })
        ]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/regions", async (req, res) => {
    try {
        const max = await Region.findOne().sort('-id');
        const id = max ? max.id + 1 : 1;
        await Region.create({ id, agentId: Number(req.body.agentId), name: req.body.name });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/api/regions/:id", async (req, res) => {
    try {
        await Region.deleteOne({ id: Number(req.params.id) });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/hotels", async (req, res) => {
    try {
        const max = await Hotel.findOne().sort('-id');
        const id = max ? max.id + 1 : 1;
        const newHotel = { id, agentId: req.body.agentId ? Number(req.body.agentId) : null, ...req.body };
        await Hotel.create(newHotel);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/api/hotels/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        const exists = await Hotel.findOne({ id });
        if (exists) {
            await Hotel.updateOne({ id }, { $set: { ...req.body, id } });
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "Not found" });
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/api/hotels/:id", async (req, res) => {
    try {
        await Hotel.deleteOne({ id: Number(req.params.id) });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/operations", async (req, res) => {
    try {
        const max = await Operation.findOne().sort('-id');
        const id = max ? max.id + 1 : 1;
        await Operation.create({ id, agentId: req.body.agentId ? Number(req.body.agentId) : null, ...req.body });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/api/operations/:id", async (req, res) => {
    try {
        await Operation.deleteOne({ id: Number(req.params.id) });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/reservations", async (req, res) => {
    try {
        const max = await Reservation.findOne().sort('-id');
        const id = max && max.id >= 1001 ? max.id + 1 : 1001; 
        
        const newRes = { id, date: new Date().toISOString(), ...req.body };
        await Reservation.create(newRes);

        const agent = await Agent.findOne({ username: newRes.submittingAgentUsername }).lean();
        let companyName = "General Company"; 
        if (agent && agent.companyId) {
            const comp = await Company.findOne({ id: agent.companyId }).lean();
            if (comp) companyName = comp.name;
        }

        const managers = await Agent.find({ role: 'ResManager', email: { $exists: true, $ne: "" } }).lean();
        const managerEmails = managers.map(m => m.email);

        if (managerEmails.length > 0) {
            sendReservationEmail(newRes, newRes.submittingAgentUsername, companyName, managerEmails);
        }

        if (bot && RES_GROUP_ID && RES_GROUP_ID !== 'BURAYA_REZERVASIYA_QRUPUNUN_ID_YAZIN') {
            let resMsg = `🆕 <b>YENİ REZERVASİYA (#${id})</b>\n\n`;
            resMsg += `👤 <b>Agent:</b> ${newRes.submittingAgentUsername}\n`;
            resMsg += `🏢 <b>Şirkət:</b> ${companyName}\n`;
            resMsg += `🏨 <b>Otel/Xidmət:</b> ${newRes.summary.hotelNames || 'Qeyd yoxdur'}\n`;
            resMsg += `📅 <b>Tarix:</b> ${newRes.summary.checkIn} — ${newRes.summary.checkOut} (${newRes.summary.nights} gecə)\n`;
            resMsg += `👥 <b>Qonaqlar:</b> ${newRes.summary.adults} Böyük, ${newRes.summary.children} Uşaq\n`;
            resMsg += `💰 <b>Yekun Qiymət:</b> ${newRes.summary.totalPrice} $\n`;
            
            bot.sendMessage(RES_GROUP_ID, resMsg, { parse_mode: 'HTML' }).catch(err=>console.error("Telegram xətası:", err));
        }

        res.json({ message: "Reservation saved", id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put("/api/reservations/status/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        const r = await Reservation.findOne({ id });
        
        if(r) {
            const oldStatus = r.status;
            let newStatus = req.body.status;
            let newChangeRequest = r.changeRequest;
            
            if(req.body.changeRequest) newChangeRequest = req.body.changeRequest;
            else if(['Confirmed','Processing','Cancelled','Admin Check'].includes(newStatus)) newChangeRequest = null;
            
            if (newStatus === 'Confirmed' && oldStatus !== 'Confirmed') {
                const hotelNamesInRes = r.summary.rooms ? r.summary.rooms.map(rm => rm.hotelName.trim()) : [];
                const uniqueHotelNames = [...new Set(hotelNamesInRes)];
                const allHotels = await Hotel.find().lean();
                
                uniqueHotelNames.forEach(async (hName) => {
                    const hotelObj = allHotels.find(h => h.name && h.name.trim() === hName);
                    if (hotelObj && hotelObj.email) {
                        await sendHotelConfirmationEmail(r, hotelObj);
                    }
                });

                const agentObj = await Agent.findOne({ username: r.submittingAgentUsername }).lean();
                if(agentObj && agentObj.email) {
                    await sendAgentVoucherEmail(r, agentObj);
                }
            }

            await Reservation.updateOne({ id }, { $set: { status: newStatus, changeRequest: newChangeRequest } });

            if (bot && RES_GROUP_ID && RES_GROUP_ID !== 'BURAYA_REZERVASIYA_QRUPUNUN_ID_YAZIN') {
                let statusMsg = `🔄 <b>REZERVASİYA STATUSU DƏYİŞDİRİLDİ (#${id})</b>\n\n`;
                statusMsg += `👤 <b>İcra edən:</b> ${req.body.adminUsername || 'Sistem / Admin'}\n`;
                statusMsg += `📉 <b>Əvvəlki Status:</b> ${oldStatus}\n`;
                statusMsg += `📈 <b>Yeni Status:</b> ${newStatus}\n`;
                bot.sendMessage(RES_GROUP_ID, statusMsg, { parse_mode: 'HTML' }).catch(err=>console.error("Telegram xətası:", err));
            }

            res.json({ success: true });
        } else {
            res.status(404).json({error: "Not found"});
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put("/api/reservations/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        const r = await Reservation.findOne({ id });
        if(r) {
            const updateFields = {};
            if(req.body.summaryUpdate) { 
                updateFields['summary.checkIn'] = req.body.summaryUpdate.checkIn;
                updateFields['summary.checkOut'] = req.body.summaryUpdate.checkOut;
            }
            if(req.body.status) updateFields.status = req.body.status;
            if(req.body.changeRequest === null) updateFields.changeRequest = null;
            
            await Reservation.updateOne({ id }, { $set: updateFields });

            if (bot && RES_GROUP_ID && RES_GROUP_ID !== 'BURAYA_REZERVASIYA_QRUPUNUN_ID_YAZIN') {
                let editMsg = `✏️ <b>REZERVASİYA REDAKTƏ EDİLDİ (#${id})</b>\n\n`;
                editMsg += `👤 <b>İcra edən:</b> ${req.body.adminUsername || 'Sistem / Admin'}\n`;
                if(req.body.summaryUpdate) {
                    editMsg += `📅 <b>Yeni Tarixlər:</b> ${req.body.summaryUpdate.checkIn} — ${req.body.summaryUpdate.checkOut}\n`;
                }
                bot.sendMessage(RES_GROUP_ID, editMsg, { parse_mode: 'HTML' }).catch(err=>console.error("Telegram xətası:", err));
            }

            res.json({ success: true });
        } else {
            res.status(404).json({error: "Not found"});
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete("/api/reservations/:id", async (req, res) => {
    try {
        await Reservation.deleteOne({ id: Number(req.params.id) });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Clasna Unified Server Running on http://localhost:${PORT}`);
});
