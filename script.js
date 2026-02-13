// === 1. ตัวแปรส่วนกลาง ===
let currentFilterStatus = 'all';
let allData = JSON.parse(localStorage.getItem('pnc_bookings')) || [];
let rawData = { provinces: [], amphures: [], tambons: [] };
let editId = null; // ตัวแปรสำคัญสำหรับระบบแก้ไข

// === 2. เริ่มต้นระบบและโหลดที่อยู่ ===
async function initAddressData() {
    try {
        // ดึงข้อมูลที่อยู่จากไฟล์ JSON
        const [pRes, aRes, tRes] = await Promise.all([
            fetch('province.json').then(r => r.json()),
            fetch('amphor.json').then(r => r.json()),
            fetch('tumbon.json').then(r => r.json())
        ]);
        rawData.provinces = pRes;
        rawData.amphures = aRes;
        rawData.tambons = tRes;

        // เติมรายชื่อจังหวัด
        const pSel = document.getElementById('province');
        if (pSel) {
            pSel.innerHTML = '<option value="">-- เลือกจังหวัด --</option>';
            rawData.provinces.sort((a, b) => a.name_th.localeCompare(b.name_th, 'th'))
                .forEach(pv => pSel.options.add(new Option(pv.name_th, pv.id)));
        }
            
        renderUI(allData); 
        updateCounts();    
    } catch (err) { 
        console.error("โหลดไฟล์ที่อยู่ไม่สำเร็จ:", err); 
    }
}

// === 3. ฟังก์ชันจัดการที่อยู่ (Province -> Amphure -> Tambon) ===
function handleProvinceChange() {
    const pId = document.getElementById('province').value;
    const aSel = document.getElementById('amphure');
    const tSel = document.getElementById('tambon');
    aSel.innerHTML = '<option value="">-- เลือกอำเภอ --</option>';
    tSel.innerHTML = '<option value="">-- เลือกตำบล --</option>';
    aSel.disabled = tSel.disabled = true;
    document.getElementById('zipcode').value = '';

    if (pId) {
        const filtered = rawData.amphures.filter(a => String(a.province_id) === String(pId));
        filtered.sort((a, b) => a.name_th.localeCompare(b.name_th, 'th'))
            .forEach(a => aSel.options.add(new Option(a.name_th, a.id)));
        aSel.disabled = false;
    }
}

function handleAmphureChange() {
    const aId = document.getElementById('amphure').value;
    const tSel = document.getElementById('tambon');
    tSel.innerHTML = '<option value="">-- เลือกตำบล --</option>';
    if (aId) {
        const filtered = rawData.tambons.filter(t => String(t.amphure_id) === String(aId));
        filtered.sort((a, b) => a.name_th.localeCompare(b.name_th, 'th'))
            .forEach(t => {
                let opt = new Option(t.name_th, t.id);
                opt.setAttribute('data-zip', t.zip_code);
                tSel.options.add(opt);
            });
        tSel.disabled = false;
    }
}

function handleTambonChange() {
    const tSel = document.getElementById('tambon');
    const selectedOption = tSel.options[tSel.selectedIndex];
    if (selectedOption) {
        document.getElementById('zipcode').value = selectedOption.getAttribute('data-zip') || '';
    }
}

// === 4. ระบบคำนวณราคา ===
function calcPrice() {
    const pkg = document.getElementById('package');
    const base = parseFloat(pkg.value) || 0;
    const type = document.getElementById('discType').value;
    const val = parseFloat(document.getElementById('discVal').value) || 0;
    let discount = type === 'percent' ? (base * val / 100) : val;
    const finalPrice = Math.max(0, base - discount);
    document.getElementById('totalTxt').innerText = finalPrice.toLocaleString() + '.-';
}

// === 5. บันทึกข้อมูล (รองรับทั้ง Add และ Edit) ===
document.getElementById('bookingForm').addEventListener('submit', async function(event) {
    event.preventDefault();

    const pkgEl = document.getElementById('package');
    const tambonEl = document.getElementById('tambon');
    
    // สร้างข้อมูลใหม่จากฟอร์ม
    const formData = {
        id: editId ? editId : Date.now(), // ใช้ ID เดิมถ้ากำลังแก้
        date: document.getElementById('bookDate').value,
        time: document.getElementById('bookTime').value,
        name: document.getElementById('custName').value,
        phone: document.getElementById('custPhone').value,
        package: pkgEl.options[pkgEl.selectedIndex].text,
        address: `${document.getElementById('addressDetail').value} ต.${tambonEl.options[tambonEl.selectedIndex]?.text || ''}...`,
        total: document.getElementById('totalTxt').innerText,
        status: 'pending'
    };

    if (editId) {
        // โหมดแก้ไข: หาตำแหน่งเดิมแล้วแทนที่
        const index = allData.findIndex(i => i.id === editId);
        if (index !== -1) {
            formData.status = allData[index].status; // คงสถานะเดิมไว้
            allData[index] = formData;
        }
        editId = null; // รีเซ็ตสถานะการแก้
    } else {
        // โหมดเพิ่มใหม่
        allData.unshift(formData);
    }

    // เซฟลง LocalStorage และอัปเดตหน้าจอ
    localStorage.setItem('pnc_bookings', JSON.stringify(allData));
    renderUI(allData);
    updateCounts();
    toggleForm(); // ปิดฟอร์มและรีเซ็ตค่า
    
    // ส่งไป Google Sheets
    await sendToSheet(formData);
});

// === 6. ระบบแก้ไข (Edit) และ ลบ (Delete) ===
function editBooking(id) {
    const item = allData.find(i => Number(i.id) === Number(id));
    if (!item) return;

    editId = id; // บอกระบบว่าตอนนี้กำลังแก้ไข ID นี้อยู่

    // เปิดฟอร์ม
    const formContainer = document.getElementById('formContainer');
    formContainer.classList.remove('hidden');

    // ดึงข้อมูลเก่าลง Field
    document.getElementById('bookDate').value = item.date;
    document.getElementById('bookTime').value = item.time;
    document.getElementById('custName').value = item.name;
    document.getElementById('custPhone').value = item.phone;
    document.getElementById('addressDetail').value = item.address.split(' ต.')[0];
    document.getElementById('totalTxt').innerText = item.total;

    // เปลี่ยนหน้าตาปุ่ม
    const submitBtn = document.querySelector('#bookingForm button[type="submit"]');
    if (submitBtn) {
        submitBtn.innerText = "อัปเดตข้อมูล";
        submitBtn.className = "w-full bg-amber-600 text-white py-4 rounded-2xl font-bold text-lg shadow-lg hover:bg-amber-700 transition-all";
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ลบ card

function deleteBooking(id) {
    if (confirm("ยืนยันการยกเลิกรายการนี้?")) {
        allData = allData.filter(item => item.id !== id);
        localStorage.setItem('pnc_bookings', JSON.stringify(allData));
        renderUI(allData);
        updateCounts();
    }
}

// === 7. แสดงผล UI (Modern List) ===
function renderUI(data) {
    const list = document.getElementById('bookingList');
    if (!list) return;

    if (data.length === 0) {
        list.innerHTML = `<div class="bg-white rounded-3xl p-10 text-center shadow-sm text-slate-400">ยังไม่มีข้อมูลคิวงาน</div>`;
        return;
    }

    const sortedData = [...data].sort((a, b) => a.time.localeCompare(b.time));

    list.innerHTML = sortedData.map((item) => `
      <div class="bg-white rounded-3xl p-6 shadow-sm border border-slate-50 mb-4 hover:shadow-md transition-all">
        <div class="flex flex-col lg:flex-row justify-between gap-4">
          <div class="flex items-start gap-4">
            <div class="bg-slate-100 text-slate-700 w-16 h-16 rounded-2xl flex flex-col items-center justify-center flex-shrink-0">
              <span class="text-[10px] font-bold uppercase">เวลา</span>
              <span class="text-lg font-black">${item.time}</span>
            </div>
            <div>
              <h4 class="font-bold text-slate-800">${item.name}</h4>
              <p class="text-sm text-emerald-600 font-medium">${item.package}</p>
              <p class="text-xs text-slate-400 mt-1">📍 ${item.address}</p>
            </div>
          </div>
          <div class="flex items-center justify-between lg:justify-end gap-4 border-t lg:border-t-0 pt-4 lg:pt-0">
            <div class="text-right">
              <p class="text-[10px] text-slate-400 uppercase tracking-widest">ยอดสุทธิ</p>
              <p class="text-xl font-black text-slate-800">${item.total}</p>
            </div>
            <div class="flex gap-2">
              <button onclick="editBooking(${item.id})" class="p-2 bg-amber-50 text-amber-600 rounded-xl hover:bg-amber-100">แก้ไข</button>
              <button onclick="deleteBooking(${item.id})" class="p-2 bg-red-50 text-red-500 rounded-xl hover:bg-red-100">ลบ</button>
            </div>
          </div>
        </div>
      </div>
    `).join('');
}

// === 8. ฟังก์ชันช่วยงานอื่นๆ ===
function toggleForm() {
    const el = document.getElementById('formContainer');
    el.classList.toggle('hidden');
    
    // ล้างค่าฟอร์มเมื่อปิด หรือเมื่อเปิดใหม่ (ถ้าไม่ได้อยู่ในโหมด Edit)
    if (el.classList.contains('hidden')) {
        editId = null;
        document.getElementById('bookingForm').reset();
        document.getElementById('totalTxt').innerText = '0.-';
        const submitBtn = document.querySelector('#bookingForm button[type="submit"]');
        if (submitBtn) {
            submitBtn.innerText = "บันทึกข้อมูล";
            submitBtn.className = "w-full bg-[#1f7054] text-white py-4 rounded-2xl font-bold text-lg shadow-lg hover:bg-[#165a43] transition-all";
        }
    }
}

function updateCounts() {
    if(document.getElementById('countAll')) document.getElementById('countAll').innerText = allData.length;
}

async function sendToSheet(formData) {
    const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzmlpgrdiadcagtbCNDyTPX6anVJMXH1ra8mUD1wSpNBwAEQd03jtoqIGlaRqwExT78Lg/exec";
    try {
        await fetch(SCRIPT_URL, { method: "POST", mode: "no-cors", body: JSON.stringify(formData) });
    } catch (err) { console.error("Sheets Error:", err); }
}

// เริ่มต้นโหลดข้อมูลที่อยู่เมื่อเปิดหน้าเว็บ
document.addEventListener('DOMContentLoaded', initAddressData);