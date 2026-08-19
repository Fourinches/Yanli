import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

const view = document.getElementById("view");
const img = document.getElementById("img");
const empty = document.getElementById("empty");
const pan = { scale: 1, x: 0, y: 0, drag: null };
let page = "https://typhoon.nmc.cn/web.html";

function paintPan() {
  img.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${pan.scale})`;
  view.classList.toggle("is-zoomed", pan.scale > 1.01);
  view.classList.toggle("is-dragging", Boolean(pan.drag));
}

function resetPan() {
  pan.scale = 1;
  pan.x = 0;
  pan.y = 0;
  pan.drag = null;
  paintPan();
}

function showImage(src) {
  if (!src) return false;
  resetPan();
  img.hidden = false;
  img.src = src;
  empty.hidden = true;
  return true;
}

async function closeWindow() {
  try {
    await getCurrentWindow().close();
  } catch {
    try {
      await invoke("close_chart_window");
    } catch {
      window.close();
    }
  }
}

async function boot() {
  try {
    const data = await invoke("get_chart_payload");
    page = data.page || page;
    if (data.file && showImage(convertFileSrc(data.file))) return;
    if (data.url && showImage(data.url)) return;
    empty.textContent = "路径图暂不可用";
  } catch {
    empty.textContent = "路径图暂不可用";
  }
}

img.addEventListener("error", () => {
  img.hidden = true;
  empty.hidden = false;
  empty.textContent = "路径图暂不可用";
});

view.addEventListener("wheel", (event) => {
  event.preventDefault();
  if (img.hidden) return;
  const next = Math.min(8, Math.max(1, pan.scale * (event.deltaY < 0 ? 1.2 : 1 / 1.2)));
  if (next === pan.scale) return;
  const box = view.getBoundingClientRect();
  const cx = event.clientX - box.left;
  const cy = event.clientY - box.top;
  const k = next / pan.scale;
  pan.x = cx - (cx - pan.x) * k;
  pan.y = cy - (cy - pan.y) * k;
  pan.scale = next;
  if (next === 1) {
    pan.x = 0;
    pan.y = 0;
  }
  paintPan();
}, { passive: false });

view.addEventListener("dblclick", resetPan);
view.addEventListener("pointerdown", (event) => {
  if (pan.scale <= 1) return;
  pan.drag = { x: event.clientX - pan.x, y: event.clientY - pan.y };
  view.setPointerCapture(event.pointerId);
  paintPan();
});
view.addEventListener("pointermove", (event) => {
  if (!pan.drag) return;
  pan.x = event.clientX - pan.drag.x;
  pan.y = event.clientY - pan.drag.y;
  paintPan();
});
const stopDrag = () => {
  pan.drag = null;
  paintPan();
};
view.addEventListener("pointerup", stopDrag);
view.addEventListener("pointercancel", stopDrag);

document.getElementById("close").addEventListener("click", closeWindow);
document.getElementById("site").addEventListener("click", () => {
  window.open(page, "_blank", "noopener");
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeWindow();
});

listen("yanli://chart", () => {
  boot();
}).catch(() => {});

boot();
