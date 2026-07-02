let national2026 = null;
let national2025 = null;
let hsaData = null;

const loadStaticData = async () => {
    try {
        const [n26, n25, hsa] = await Promise.all([
            fetch('./data/national_2026.json').then(r => r.json()),
            fetch('./data/national_2025.json').then(r => r.json()),
            fetch('./data/hsa_data.json').then(r => r.json())
        ]);
        national2026 = n26;
        national2025 = n25;
        hsaData = hsa;
    } catch(e) {
        console.error("Error loading static base data", e);
    }
};

const getSortedMap = (freqMap) => {
    let entries = Object.keys(freqMap).map(k => ({score: parseFloat(k), count: freqMap[k]}));
    entries.sort((a,b) => a.score - b.score);
    return entries;
};

const getRank = (sortedMap, myScore) => {
    let higherCount = 0;
    let total = 0;
    for (let e of sortedMap) {
        total += e.count;
        if (e.score > myScore) higherCount += e.count;
    }
    return { rank: higherCount + 1, total };
};

const getPercentile = (sortedMap, myScore) => {
    let lessOrEqual = 0;
    let total = 0;
    for (let e of sortedMap) {
        total += e.count;
        if (e.score <= myScore) lessOrEqual += e.count;
    }
    return total > 0 ? lessOrEqual / total : 0;
};

const getEquivalentScore = (sortedMap, percentile) => {
    let total = sortedMap.reduce((sum, e) => sum + e.count, 0);
    let targetIndex = percentile * total;
    let cumulative = 0;
    for (let e of sortedMap) {
        cumulative += e.count;
        if (cumulative >= targetIndex) return e.score;
    }
    return sortedMap.length > 0 ? sortedMap[sortedMap.length-1].score : null;
};

document.addEventListener("DOMContentLoaded", () => {
    // Start preloading data right away
    loadStaticData();

    const sbdInput = document.getElementById("sbdInput");
    const searchBtn = document.getElementById("searchBtn");
    
    const loadingEl = document.getElementById("loading");
    const errorEl = document.getElementById("error");
    const resultsEl = document.getElementById("results");
    
    const renderCards = (containerId, data, isKhoi) => {
        const container = document.getElementById(containerId);
        container.innerHTML = "";
        
        data.forEach((item, index) => {
            const card = document.createElement("div");
            card.className = `score-card ${isKhoi ? 'khoi' : ''}`;
            card.style.animationDelay = `${index * 0.08}s`;
            
            let html = `
                <div class="subject-name">${item.name}</div>
                <div class="score-value">${item.score}</div>
                <div class="rank-info">
                    <span>Xếp hạng tỉnh:</span>
                    <strong>${item.rank_tinh}</strong>
                </div>
                <div class="rank-info">
                    <span>Xếp hạng QG:</span>
                    <strong>${item.rank_qg}</strong>
                </div>
            `;
            
            if (item.equivalent_2025 !== null) {
                html += `
                    <div class="equivalent">
                        Điểm QĐ 2025: ${item.equivalent_2025}
                    </div>
                `;
            }
            
            card.innerHTML = html;
            container.appendChild(card);
        });
    };
    
    const performSearch = async () => {
        const sbd = sbdInput.value.trim();
        if (!sbd) return;
        
        loadingEl.classList.remove("hidden");
        errorEl.classList.add("hidden");
        resultsEl.classList.add("hidden");
        
        try {
            const sbdStr = sbd.replace(/\D/g, "").padStart(8, "0");
            const ma_tinh = sbdStr.substring(0, 2);
            
            if (!national2026) await loadStaticData();
            
            const res = await fetch(`./data/provinces/${ma_tinh}.json`);
            if (!res.ok) throw new Error("Không tìm thấy dữ liệu tỉnh.");
            const provData = await res.json();
            
            const studentScores = provData.students[sbdStr];
            if (!studentScores) throw new Error("Không tìm thấy SBD.");
            
            const cols = provData.cols;
            const monList = [];
            const khoiList = [];
            
            const displayNames = [
                "Toán", "Ngữ văn", "Vật lý", "Hóa học", "Sinh học", "Lịch sử", "Địa lý", "Ngoại ngữ",
                "Khối A00", "Khối A01", "Khối B00", "Khối C00", "Khối D01", "Khối A02", "Khối C01", "Khối D07"
            ];
            
            for (let i=0; i<cols.length; i++) {
                const ten_cot = cols[i];
                const ten_hien_thi = displayNames[i];
                const diem_ts = studentScores[i];
                if (diem_ts === null || diem_ts === undefined) continue;
                
                const provMap = getSortedMap(provData.stats[ten_cot] || {});
                const { rank: rank_tinh, total: tong_tinh } = getRank(provMap, diem_ts);
                
                const natMap26 = getSortedMap(national2026[ten_cot] || {});
                const { rank: rank_qg, total: tong_qg } = getRank(natMap26, diem_ts);
                
                let equivalent_2025 = null;
                const natMap25 = getSortedMap(national2025[ten_cot] || {});
                if (natMap25.length > 0 && natMap26.length > 0) {
                    const pct = getPercentile(natMap26, diem_ts);
                    equivalent_2025 = getEquivalentScore(natMap25, pct);
                }
                
                const item = {
                    name: ten_hien_thi,
                    score: diem_ts,
                    rank_tinh: `${rank_tinh.toLocaleString('en-US')}/${tong_tinh.toLocaleString('en-US')}`,
                    rank_qg: `${rank_qg.toLocaleString('en-US')}/${tong_qg.toLocaleString('en-US')}`,
                    equivalent_2025: equivalent_2025 !== null ? equivalent_2025.toFixed(2) : null
                };
                
                if (ten_hien_thi.startsWith("Khối")) {
                    khoiList.push(item);
                } else {
                    monList.push(item);
                }
            }
            
            document.getElementById("resSBD").textContent = sbdStr;
            document.getElementById("resTinh").textContent = ma_tinh;
            
            renderCards("monContainer", monList, false);
            renderCards("khoiContainer", khoiList, true);
            
            loadingEl.classList.add("hidden");
            resultsEl.classList.remove("hidden");
            
        } catch (e) {
            loadingEl.classList.add("hidden");
            errorEl.textContent = e.message || "Không thể tải dữ liệu.";
            errorEl.classList.remove("hidden");
        }
    };
    
    searchBtn.addEventListener("click", performSearch);
    sbdInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") performSearch();
    });

    const hsaType = document.getElementById("hsaType");
    const hsaScore = document.getElementById("hsaScore");
    const hsaTarget = document.getElementById("hsaTarget");
    const hsaConvertBtn = document.getElementById("hsaConvertBtn");
    const hsaError = document.getElementById("hsaError");
    const hsaResult = document.getElementById("hsaResult");

    const performHsaConvert = async () => {
        const score = hsaScore.value.trim();
        if (!score) return;
        
        hsaError.classList.add("hidden");
        hsaResult.classList.add("hidden");
        
        try {
            if (!hsaData || !national2026) await loadStaticData();
            
            const type = hsaType.value;
            const targetCol = hsaTarget.value;
            
            if (!hsaData[type] || hsaData[type][score] === undefined) {
                throw new Error("Không có dữ liệu cho mức điểm này.");
            }
            
            const pct = hsaData[type][score];
            const frac = pct / 100.0;
            
            const natMap26 = getSortedMap(national2026[targetCol] || {});
            if (natMap26.length === 0) throw new Error("Môn/Khối không hợp lệ.");
            
            const equivalent = getEquivalentScore(natMap26, frac);
            const targetText = hsaTarget.options[hsaTarget.selectedIndex].text;
            
            hsaResult.innerHTML = `
                <div class="hsa-result-card">
                    <h3>Mức điểm THPT tương đương (${targetText})</h3>
                    <div class="score-value">${equivalent.toFixed(2)}</div>
                    <p>Bách phân vị HSA: <strong>${pct}%</strong></p>
                </div>
            `;
            hsaResult.classList.remove("hidden");
        } catch(e) {
            hsaError.textContent = e.message || "Lỗi xử lý.";
            hsaError.classList.remove("hidden");
        }
    };
    
    hsaConvertBtn.addEventListener("click", performHsaConvert);
    hsaScore.addEventListener("keypress", (e) => {
        if (e.key === "Enter") performHsaConvert();
    });
});
