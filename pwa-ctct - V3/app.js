/***************** CTĐ, CTCT – APP.JS (Mức 3) *****************/

const SHEET_API = 'https://script.google.com/macros/s/AKfycbzTWwWlLoUdAej0wVUXWw_aO08xF8QMLyU_2VcUki-3u23s20xScNZF0kzMuo9C23Vcsw/exec';
const BANKS_FOLDER_ID = '1_-YhEHfYfF957yC6o-xyiPk06XRheKb6';

const TOTAL_QUESTIONS  = 30;
const DURATION_MINUTES = 30;
const MIX_PER_FILE_MAX = 0;

// LS keys
const LS_STATE = 'ctct_exam_state';
const LS_QUEUE = 'ctct_result_queue';
const LS_LAST  = 'ctct_last_result_for_review';

let questions = [];
let selections = {};
let currentIndex = 0;
let timer, remainingSeconds;
let submitted = false;
let examCode = '';

function pad(n){return n<10?'0'+n:''+n;}
function classify(s,t){const r=s/t;return r>=.9?'Giỏi':r>=.8?'Khá':r>=.6?'Đạt yêu cầu':'Chưa đạt';}
function genCode(){const base=(Date.now()%9000)+1000;const rnd=Math.floor(Math.random()*9);return String((base+rnd)%9000+1000);}

// ===== Offline queue =====
function getQueue(){try{return JSON.parse(localStorage.getItem(LS_QUEUE)||'[]');}catch{ return []}}
function setQueue(q){localStorage.setItem(LS_QUEUE, JSON.stringify(q));}
async function flushQueue(){
  const q = getQueue();
  if(!q.length) return;
  const remain=[];
  for(const item of q){
    try{
      await fetch(SHEET_API,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/json'},body:JSON.stringify(item)});
    }catch{ remain.push(item); }
  }
  setQueue(remain);
}
window.addEventListener('online', flushQueue);

// ===== Load questions from folder (server mixes) =====
async function loadMixedQuestions(){
  const url = `${SHEET_API}?action=mixQuestions&folderId=${encodeURIComponent(BANKS_FOLDER_ID)}&limit=${TOTAL_QUESTIONS}&perFile=${MIX_PER_FILE_MAX}&tab=${encodeURIComponent('Câu hỏi')}`;
  const res = await fetch(url,{cache:'no-store'});
  const data = await res.json();
  const bank = Array.isArray(data.questions)?data.questions:[];
  if(!bank.length) throw new Error('Không lấy được câu hỏi từ thư mục ngân hàng.');
  // mỗi phần tử mong đợi: { question, options:{A,B,C,D?}, answer, explanation? }
  questions = bank;
  const prog = document.getElementById('progress'); if(prog) prog.textContent=`0/${questions.length}`;
  const fill = document.getElementById('progressFill'); if(fill) fill.style.width='0%';
}

// ===== render =====
function renderQuestion(){
  const q = questions[currentIndex]||{};
  document.getElementById('qTitle').textContent=`Câu ${currentIndex+1}`;
  document.getElementById('qText').textContent=q.question||'';

  const box = document.getElementById('options'); box.innerHTML=''; box.setAttribute('role','radiogroup');
  const opts = q.options||{};
  const keys = ['A','B','C','D'].filter(k => (opts[k]??'').toString().trim().length>0);

  keys.forEach(k=>{
    const id=`opt_${currentIndex}_${k}`;
    const label=document.createElement('label'); label.className='option'; label.setAttribute('for',id);
    label.innerHTML=`
      <input type="radio" id="${id}" name="ans" value="${k}">
      <span class="opt-text"><b>${k}.</b> ${opts[k]}</span>`;
    box.appendChild(label);
  });

  if(selections[currentIndex] && keys.includes(selections[currentIndex])){
    const sel=document.querySelector(`input[name="ans"][value="${selections[currentIndex]}"]`); if(sel) sel.checked=true;
  }else{ delete selections[currentIndex]; }

  document.getElementById('progress').textContent=`${currentIndex+1}/${questions.length}`;
  const fill=document.getElementById('progressFill'); if(fill) fill.style.width=`${((currentIndex+1)/questions.length)*100}%`;

  // autosave sau mỗi render
  saveState();
}

function startTimer(){
  remainingSeconds = DURATION_MINUTES*60;
  const el=document.getElementById('time');
  const tick=()=>{
    const m=Math.floor(remainingSeconds/60), s=remainingSeconds%60;
    el.textContent=`${pad(Math.max(m,0))}:${pad(Math.max(s,0))}`;
    if(remainingSeconds<=300){el.style.color='#a00000';el.style.fontWeight='700';}
    if(remainingSeconds<=0){clearInterval(timer);submitQuiz();return;}
    remainingSeconds--; saveState();
  };
  tick(); timer=setInterval(tick,1000);
}

// ===== Persist state (resume) =====
function saveState(){
  const payload = {
    ts: Date.now(),
    examCode, currentIndex, remainingSeconds,
    selections, questions
  };
  localStorage.setItem(LS_STATE, JSON.stringify(payload));
}
function hasState(){ return !!localStorage.getItem(LS_STATE); }
function loadState(){
  try{
    const st=JSON.parse(localStorage.getItem(LS_STATE)||'{}');
    if(!st || !st.questions || !Array.isArray(st.questions)) return false;
    examCode = st.examCode || genCode();
    questions = st.questions; selections = st.selections||{};
    currentIndex = st.currentIndex||0; remainingSeconds = st.remainingSeconds||DURATION_MINUTES*60;
    return true;
  }catch{ return false; }
}
function clearState(){ localStorage.removeItem(LS_STATE); }

// ===== Main =====
window.addEventListener('DOMContentLoaded', ()=>{
  flushQueue(); // thử gửi những kết quả xếp hàng

  const isQuiz = document.getElementById('quizBox') && document.getElementById('startBtn');
  if(!isQuiz) return;

  const startBtn=document.getElementById('startBtn');
  const resumeBtn=document.getElementById('resumeBtn');
  const startCard=document.getElementById('startCard');
  const quizBox=document.getElementById('quizBox');
  const resultCard=document.getElementById('resultCard');

  // nếu có state -> cho phép tiếp tục
  if(hasState()) resumeBtn.hidden=false;

  startBtn.addEventListener('click', async ()=>{
    const name=document.getElementById('fullname').value.trim();
    const unit=document.getElementById('unit').value.trim();
    const position=document.getElementById('position').value.trim();
    if(!name||!unit||!position){ alert('Vui lòng nhập đầy đủ Họ tên, Đơn vị, Chức vụ.'); return; }

    examCode = genCode();
    const codeEl=document.getElementById('examCode'); if(codeEl) codeEl.textContent=examCode;

    try{ await loadMixedQuestions(); }
    catch(e){ alert(e.message||'Lỗi tải câu hỏi. Kiểm tra SHEET_API / BANKS_FOLDER_ID.'); return; }

    startCard.hidden=true; quizBox.hidden=false;
    renderQuestion(); startTimer();
  });

  resumeBtn.addEventListener('click', ()=>{
    const ok = loadState();
    if(!ok){ alert('Không tìm thấy bài đang làm.'); return; }
    const codeEl=document.getElementById('examCode'); if(codeEl) codeEl.textContent=examCode;
    startCard.hidden=true; quizBox.hidden=false;
    renderQuestion();

    // phục hồi timer
    const el=document.getElementById('time');
    const tick=()=>{
      const m=Math.floor(remainingSeconds/60), s=remainingSeconds%60;
      el.textContent=`${pad(Math.max(m,0))}:${pad(Math.max(s,0))}`;
      if(remainingSeconds<=300){el.style.color='#a00000';el.style.fontWeight='700';}
      if(remainingSeconds<=0){clearInterval(timer);submitQuiz();return;}
      remainingSeconds--; saveState();
    };
    tick(); timer=setInterval(tick,1000);
  });

  document.getElementById('nextBtn').addEventListener('click', ()=>{
    const c=document.querySelector('input[name="ans"]:checked'); if(c) selections[currentIndex]=c.value;
    if(currentIndex<questions.length-1){ currentIndex++; renderQuestion(); }
  });
  document.getElementById('prevBtn').addEventListener('click', ()=>{
    const c=document.querySelector('input[name="ans"]:checked'); if(c) selections[currentIndex]=c.value;
    if(currentIndex>0){ currentIndex--; renderQuestion(); }
  });

  document.getElementById('reviewBtn').addEventListener('click', ()=>{
    const unanswered = questions.map((_,i)=> selections[i]?null:i+1).filter(Boolean);
    if(unanswered.length){
      alert('Bạn chưa trả lời các câu: '+unanswered.join(', '));
      const idx=unanswered[0]-1; if(idx>=0){ currentIndex=idx; renderQuestion(); }
    }else alert('Bạn đã trả lời tất cả câu hỏi.');
  });

  document.getElementById('submitBtn').addEventListener('click', submitQuiz);

  async function submitQuiz(){
    if(submitted) return; submitted=true;
    const btn=document.getElementById('submitBtn'); if(btn) btn.disabled=true;
    clearInterval(timer);

    const lastPick=document.querySelector('input[name="ans"]:checked'); if(lastPick) selections[currentIndex]=lastPick.value;

    // chấm
    let score=0;
    const details = questions.map((q,i)=>{
      const chosen = selections[i]||'';
      const ok = chosen===q.answer; if(ok) score++;
      return {
        index:i+1, question:q.question, chosen, correct:q.answer,
        explanation: q.explanation || ''  // ← dùng ở review.html
      };
    });

    const total=questions.length;
    const name=document.getElementById('fullname').value.trim();
    const unit=document.getElementById('unit').value.trim();
    const position=document.getElementById('position').value.trim();

    // hiển thị tổng quan
    document.getElementById('resultText').textContent =
      `${name} - ${unit} (${position}) | Mã đề ${examCode}: ${score}/${total} điểm`;
    document.getElementById('classification').textContent = 'Xếp loại: ' + classify(score,total);
    document.getElementById('quizBox').hidden=true;
    document.getElementById('resultCard').hidden=false;

    // lưu cho trang review
    localStorage.setItem(LS_LAST, JSON.stringify({ name, unit, position, examCode, score, total, details }));

    // clear draft
    clearState();

    // gửi sheet (offline -> xếp hàng)
    const payload = {
      examCode, name, unit, position, score, total, details,
      timestamp: new Date().toISOString()
    };
    try{
      await fetch(SHEET_API,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    }catch{
      const q=getQueue(); q.push(payload); setQueue(q);
    }
  }
});


