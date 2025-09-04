console.log("Script loaded");

const form = document.getElementById("uploadForm");
const spinner = document.getElementById("spinner");
const btnText = document.getElementById("btnText");
const submitBtn = document.getElementById("submitBtn");
const cardFlipper = document.getElementById("cardFlipper");
const toast = document.getElementById("toast");
const darkToggle = document.getElementById("darkToggle");

// --- DOB modal elements ---
const dobModal = document.getElementById("dobModal");
const dobSub = document.getElementById("dobSub");
const dobInput = document.getElementById("dobInput");
const dobError = document.getElementById("dobError");
const dobCancel = document.getElementById("dobCancel");
const dobConfirm = document.getElementById("dobConfirm");
const dobSpinner = document.getElementById("dobSpinner");
const dobConfirmText = document.getElementById("dobConfirmText");

function openDobModal(subtext) {
  if (dobSub) dobSub.textContent = subtext || "";
  if (dobError) {
    dobError.style.display = "none";
    dobError.textContent = "";
  }
  if (dobInput) dobInput.value = "";

  if (!dobModal) return;
  // prepare
  dobModal.style.display = "flex";
  // animate in on next frame
  requestAnimationFrame(() => dobModal.classList.add("visible"));
}

function closeDobModal() {
  if (!dobModal) return;
  dobModal.classList.remove("visible");
  // wait for animation to finish, then hide
  const onEnd = () => {
    dobModal.style.display = "none";
    dobModal.removeEventListener("transitionend", onEnd);
  };
  dobModal.addEventListener("transitionend", onEnd);
}

// keep track of uploaded base name for naming the PDF
let uploadedBaseName = "";

// to remember generated image paths for PDF endpoint
let generatedFrontPath = "";
let generatedBackPath = "";

// DARK MODE
if (localStorage.getItem("theme") === "dark") {
  darkToggle.checked = true;
  document.body.classList.add("dark");
}

darkToggle.addEventListener("change", () => {
  document.body.classList.toggle("dark", darkToggle.checked);
  localStorage.setItem("theme", darkToggle.checked ? "dark" : "light");
});

// FLIP CARD
cardFlipper.addEventListener("click", () => {
  cardFlipper.classList.toggle("flipped");
});

// TOAST
function showToast(message = "Success!") {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 4000);
}

// SET IMAGE STATE
function setImageLoadState(img) {
  img.onload = null;
  img.onerror = () => {
    console.error("Failed to load image:", img.src);
  };
}

// Hide instructions smoothly (visible again on refresh)
function hideInstructionsSmoothly() {
  const box = document.getElementById("instructions");
  if (!box) return;
  box.style.opacity = "0";
  box.style.transform = "translateY(-8px)";
  box.addEventListener(
    "transitionend",
    () => {
      box.style.display = "none";
    },
    { once: true }
  );
}

// FORM SUBMISSION
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const file = document.getElementById("aadhaarFile").files[0];
  let passwordInput = document.getElementById("password");
  let passwordError = document.getElementById("passwordError");

  if (!file) return;

  // filename (without extension)
  uploadedBaseName = file.name.split(".")[0];

  // Take filename (without extension) as default password
  let autoPassword = uploadedBaseName;
  let password = passwordInput.value.trim() || autoPassword;

  const formData = new FormData();
  formData.append("aadhaar", file);
  formData.append("password", password);

  submitBtn.disabled = true;
  spinner.classList.remove("hidden");
  btnText.textContent = "Generating...";

  try {
    const res = await fetch("/upload", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    // --- YOB-only flow: backend is asking for a full DOB ---
    dobConfirm.onclick = async () => {
      const iso = dobInput.value; // yyyy-mm-dd
      if (!iso) {
        dobError.textContent = "Please pick a date.";
        dobError.style.display = "block";
        return;
      }
      const [yyyy, mm, dd] = iso.split("-");
      if (String(data.yob) !== yyyy) {
        dobError.textContent = `Year must match ${data.yob}. You picked ${yyyy}.`;
        dobError.style.display = "block";
        return;
      }

      // --- Start loading state on modal confirm ---
      dobConfirm.disabled = true;
      if (dobSpinner) dobSpinner.classList.remove("hidden");
      if (dobConfirmText) dobConfirmText.textContent = "Generating...";

      try {
        const finalizeRes = await fetch("/finalize-dob", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            baseName: uploadedBaseName,
            dobFull: `${dd}/${mm}/${yyyy}`,
          }),
        });
        const finalizeData = await finalizeRes.json();
        if (!finalizeRes.ok) {
          dobError.textContent = finalizeData.error || "Failed to finalize.";
          dobError.style.display = "block";
          return; // keep modal open, still in loading—so fall through to finally to reset button
        }

        closeDobModal();

        // ---- Continue like normal success path using finalize output ----
        const base = window.location.origin;
        const templateFront = document.getElementById("templateFront");
        const templateBack = document.getElementById("templateBack");
        const downloadFront = document.getElementById("downloadFront");
        const downloadBack = document.getElementById("downloadBack");

        templateFront.src = base + finalizeData.downloadUrlFront;
        templateBack.src = base + finalizeData.downloadUrlBack;

        generatedFrontPath = finalizeData.downloadUrlFront;
        generatedBackPath = finalizeData.downloadUrlBack;

        setImageLoadState(templateFront);
        setImageLoadState(templateBack);

        downloadFront.href = templateFront.src;
        downloadBack.href = templateBack.src;

        document.getElementById("templatePreview").style.display = "block";

        await Promise.all([
          new Promise((r) => (templateFront.onload = r)),
          new Promise((r) => (templateBack.onload = r)),
        ]);

        hideInstructionsSmoothly();
        showToast("Aadhaar card generated successfully!");
      } catch (e) {
        console.error(e);
        dobError.textContent = "Something went wrong while finalizing.";
        dobError.style.display = "block";
      } finally {
        // --- Reset loading state ---
        dobConfirm.disabled = false;
        if (dobSpinner) dobSpinner.classList.add("hidden");
        if (dobConfirmText) dobConfirmText.textContent = "Confirm";
      }
    };

    if (data.error) {
      passwordError.textContent =
        "❌ Wrong password detected. Please enter it manually.";
      passwordError.style.display = "block";
      passwordInput.style.display = "block"; // show password box
      passwordInput.focus();
      return;
    } else {
      passwordError.style.display = "none"; // clear error if success
      const base = window.location.origin;
      const templateFront = document.getElementById("templateFront");
      const templateBack = document.getElementById("templateBack");
      const downloadFront = document.getElementById("downloadFront");
      const downloadBack = document.getElementById("downloadBack");

      // Assign src first
      templateFront.src = base + data.downloadUrlFront;
      templateBack.src = base + data.downloadUrlBack;

      // Remember server paths for PDF endpoint
      generatedFrontPath = data.downloadUrlFront;
      generatedBackPath = data.downloadUrlBack;

      // Then set image state
      setImageLoadState(templateFront);
      setImageLoadState(templateBack);

      downloadFront.href = templateFront.src;
      downloadBack.href = templateBack.src;

      document.getElementById("templatePreview").style.display = "block";

      await Promise.all([
        new Promise((res) => (templateFront.onload = res)),
        new Promise((res) => (templateBack.onload = res)),
      ]);

      // Smoothly hide the instruction box (returns on refresh)
      hideInstructionsSmoothly();

      showToast("Aadhaar card generated successfully!");
    }
  } catch (err) {
    console.error("Upload failed", err);
    alert("Something went wrong");
  } finally {
    btnText.textContent = "Generate Aadhaar Card";
    spinner.classList.add("hidden");
    submitBtn.disabled = false;
  }
});

// PDF GENERATION
const pdfBtn = document.getElementById("pdfBtn");
const pdfSpinner = document.getElementById("pdfSpinner");
const pdfBtnText = document.getElementById("pdfBtnText");

pdfBtn.addEventListener("click", async () => {
  if (!generatedFrontPath || !generatedBackPath) return;

  pdfBtn.disabled = true;
  pdfSpinner.classList.remove("hidden");
  pdfBtnText.textContent = "Creating PDF...";

  try {
    // Send only the pathnames the server can resolve
    const payload = {
      frontPath: new URL(window.location.origin + generatedFrontPath).pathname,
      backPath: new URL(window.location.origin + generatedBackPath).pathname,
      baseName: uploadedBaseName,
    };

    const res = await fetch("/generate-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error("PDF generation failed");
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${uploadedBaseName}-pdf.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error(e);
    alert("Failed to generate PDF");
  } finally {
    pdfBtnText.textContent = "Download Aadhaar PDF";
    pdfSpinner.classList.add("hidden");
    pdfBtn.disabled = false;
  }
});
