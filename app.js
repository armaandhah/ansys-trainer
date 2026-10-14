// ANSYS Trainer interactions
(function () {
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  // theme
  const root = document.documentElement;
  const savedTheme = store.get("ansys-theme", null);
  if (savedTheme) root.setAttribute("data-theme", savedTheme);
  document.getElementById("themeBtn").addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
    root.setAttribute("data-theme", next);
    store.set("ansys-theme", next);
  });

  // mobile menu
  const sidebar = document.querySelector("nav.sidebar");
  document.getElementById("menuBtn").addEventListener("click", () => sidebar.classList.toggle("open"));
  sidebar.addEventListener("click", (e) => { if (e.target.closest("a")) sidebar.classList.remove("open"); });

  // build sidebar from modules
  const modules = [...document.querySelectorAll("section.module")];
  const navList = document.getElementById("navList");
  let lastGroup = null;
  modules.forEach((m, i) => {
    const g = m.dataset.group;
    if (g && g !== lastGroup) { const h = document.createElement("h4"); h.textContent = g; navList.appendChild(h); lastGroup = g; }
    const a = document.createElement("a");
    a.href = "#" + m.id;
    a.dataset.id = m.id;
    a.innerHTML = `<span class="num">${String(i).padStart(2, "0")}</span><span>${m.dataset.title}</span><span class="tick">✓</span>`;
    navList.appendChild(a);
  });

  // done tracking
  const done = store.get("ansys-done", {});
  function refreshProgress() {
    const n = modules.filter(m => done[m.id]).length;
    document.getElementById("progress").innerHTML = `<b>${n}</b>/${modules.length} modules done`;
    navList.querySelectorAll("a").forEach(a => a.classList.toggle("done", !!done[a.dataset.id]));
  }
  modules.forEach(m => {
    const head = m.querySelector(".module-head");
    if (!head) return;
    const lab = document.createElement("label");
    lab.className = "done-toggle";
    lab.innerHTML = `<input type="checkbox"> mark done`;
    const cb = lab.querySelector("input");
    cb.checked = !!done[m.id];
    cb.addEventListener("change", () => { done[m.id] = cb.checked; store.set("ansys-done", done); refreshProgress(); });
    head.appendChild(lab);
  });
  refreshProgress();

  // scrollspy
  const links = {};
  navList.querySelectorAll("a").forEach(a => links[a.dataset.id] = a);
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        Object.values(links).forEach(l => l.classList.remove("active"));
        const l = links[en.target.id];
        if (l) { l.classList.add("active"); l.scrollIntoView({ block: "nearest" }); }
      }
    });
  }, { rootMargin: "-40% 0px -55% 0px" });
  modules.forEach(m => io.observe(m));

  // reveal blocks
  document.querySelectorAll(".reveal").forEach(r => {
    const b = r.querySelector("button");
    b.addEventListener("click", () => {
      r.classList.toggle("open");
      b.textContent = r.classList.contains("open") ? "Hide answer" : (b.dataset.label || "Show answer");
    });
    b.dataset.label = b.textContent;
  });

  // support picker
  const tree = {
    q: "What does the real part touch at this location?",
    opts: [
      { t: "Welded / bolted solidly to something much stiffer (and I don't care about local stresses there)", r: "fixed" },
      { t: "A cut I made for symmetry", r: "frictionless-sym" },
      { t: "A pin or bolt going through a hole", next: {
        q: "Should the part be able to rotate about the pin?",
        opts: [
          { t: "Yes, it's a clevis / pivot / bushing", r: "cyl-free" },
          { t: "No, it's clamped by a tightened bolt", next: {
            q: "How much do you care about stresses near the bolt?",
            opts: [
              { t: "Not much, I care about the rest of the part", r: "cyl-fixed" },
              { t: "A lot, the bolt joint is the thing I'm checking", r: "bolt" }
            ]}}
        ]}},
      { t: "A flat surface it rests on (floor, plate), and it could lift off", r: "compression" },
      { t: "Something far away that I didn't model (a hub, a frame, a rod end)", r: "remote" },
      { t: "Rubber / soil / a foam pad (springy foundation)", r: "elastic" },
      { t: "Nothing, but I need to stop rigid body motion", r: "weak" }
    ]
  };
  const results = {
    "fixed": ["Fixed Support", "Zero translation (and rotation for shells/beams) on the face. Simplest choice, but it is infinitely stiff, so stresses right at the edge of the support are unreliable. Read stresses a short distance away.", "#sup-fixed"],
    "frictionless-sym": ["Frictionless Support (or a Symmetry region)", "Locks motion normal to the cut face and lets it slide in-plane. This is exactly the boundary condition a symmetry plane needs.", "#sup-frictionless"],
    "cyl-free": ["Cylindrical Support: Radial Fixed, Axial Fixed, Tangential Free", "The hole can't move radially or slide along the pin, but it can spin about it. Better yet, model the pin with a remote displacement with ROTZ free, or a revolute joint.", "#sup-cyl"],
    "cyl-fixed": ["Cylindrical Support: all three Fixed", "Holds the hole in place without the extra stiffness of gluing the whole face like a Fixed Support would do on a flat face. Still a little too stiff in reality, which is fine away from the hole.", "#sup-cyl"],
    "bolt": ["Model the bolt", "Use a bolt body (or beam connection) with Bolt Pretension, frictional contact under the head and between the clamped plates, and Fixed Support on whatever is under the stack. This is nonlinear but it's the only way to get believable stresses at the joint.", "#load-bolt"],
    "compression": ["Compression Only Support", "Pushes back only if the face tries to go into the surface, lets it lift off. Nonlinear (it's really contact against a rigid wall), so solve takes longer. Add a weak spring or another support so the model isn't free to float.", "#sup-compression"],
    "remote": ["Remote Displacement", "Put a remote point where the missing part's connection is (e.g. hub center, rod end center) and choose which of the 6 DOF are fixed. Rigid vs Deformable behavior controls how much the face is stiffened.", "#sup-remote"],
    "elastic": ["Elastic Support", "Foundation stiffness in force per area per length (e.g. N/mm³). Good for parts sitting on rubber mounts or soil.", "#sup-elastic"],
    "weak": ["Inertia relief or Weak Springs", "If loads are self-balanced (e.g. a free-floating assembly with equal and opposite loads), turn on Inertia Relief in Analysis Settings, or let Weak Springs stabilize it. Then check reactions are basically zero.", "#mod-settings"]
  };
  const picker = document.getElementById("picker");
  if (picker) {
    let path = [];
    function render(node) {
      picker.innerHTML = "";
      const crumbs = document.createElement("div"); crumbs.className = "crumbs";
      crumbs.textContent = path.length ? "↳ " + path.join(" → ") : "Answer a couple of questions";
      picker.appendChild(crumbs);
      const q = document.createElement("div"); q.className = "q"; q.textContent = node.q; picker.appendChild(q);
      const opts = document.createElement("div"); opts.className = "opts";
      node.opts.forEach(o => {
        const b = document.createElement("button"); b.className = "btn"; b.textContent = o.t;
        b.addEventListener("click", () => {
          path.push(o.t.split(/[,(]/)[0].trim());
          if (o.next) render(o.next); else showResult(o.r);
        });
        opts.appendChild(b);
      });
      picker.appendChild(opts);
    }
    function showResult(key) {
      const [name, txt, href] = results[key];
      picker.innerHTML = `<div class="crumbs">↳ ${path.join(" → ")}</div>
        <div class="callout good"><b class="t">Use this</b><b>${name}</b><br>${txt} <a href="${href}">Read the full card →</a></div>
        <button class="btn" id="pickerReset">Start over</button>`;
      document.getElementById("pickerReset").addEventListener("click", () => { path = []; render(tree); });
    }
    render(tree);
  }

  // quiz
  const quiz = window.QUIZ || [];
  const qWrap = document.getElementById("quiz");
  if (qWrap) {
    let score = 0, answered = 0;
    const scoreEl = document.getElementById("quizScore");
    const upd = () => scoreEl.textContent = `Score: ${score} / ${answered} answered (${quiz.length} total)`;
    quiz.forEach((item, qi) => {
      const d = document.createElement("div"); d.className = "quiz-q";
      d.innerHTML = `<div class="qt">${qi + 1}. ${item.q}</div>` +
        item.a.map((a, ai) => `<label data-i="${ai}"><input type="radio" name="q${qi}" hidden>${a}</label>`).join("") +
        `<div class="why">${item.why}</div>`;
      d.querySelectorAll("label").forEach(l => l.addEventListener("click", () => {
        if (d.classList.contains("answered")) return;
        d.classList.add("answered"); answered++;
        const i = +l.dataset.i;
        if (i === item.c) { l.classList.add("right"); score++; }
        else { l.classList.add("wrong"); d.querySelector(`label[data-i="${item.c}"]`).classList.add("right"); }
        upd();
      }));
      qWrap.appendChild(d);
    });
    upd();
    document.getElementById("quizReset").addEventListener("click", () => { qWrap.innerHTML = ""; score = answered = 0; quiz.length && (function(){})(); location.hash = "#mod-quiz"; window.location.reload(); });
  }
})();
