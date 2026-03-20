document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  const lineInputs = {
    1: $("input-line1"),
    2: $("input-line2"),
    3: $("input-line3")
  };

  const lineEls = {
    1: $("line1"),
    2: $("line2"),
    3: $("line3")
  };

  const fontSelects = {
    1: $("font-select-1"),
    2: $("font-select-2"),
    3: $("font-select-3")
  };

  const sizeDisplays = {
    1: $("line1-size-display"),
    2: $("line2-size-display"),
    3: $("line3-size-display")
  };

  const minusBtns = {
    1: $("line1-minus"),
    2: $("line2-minus"),
    3: $("line3-minus")
  };

  const plusBtns = {
    1: $("line1-plus"),
    2: $("line2-plus"),
    3: $("line3-plus")
  };

  const textZone = $("plaque-text-zone");
  const plaqueBase = $("plaque-base");
  const overlay = $("plaque-overlay");
  const overlayInput = $("overlay-url");

  const logoMode = $("logo-mode");
  const oneLogoSide = $("one-logo-side");
  const oneLogoInput = $("one-logo-input");
  const pictoLeft = $("picto-left");
  const pictoRight = $("picto-right");

  const oneLogoSideWrap = $("one-logo-side-wrap");
  const oneLogoInputWrap = $("one-logo-input-wrap");
  const leftLogoInputWrap = $("left-logo-input-wrap");
  const rightLogoInputWrap = $("right-logo-input-wrap");

  const generateBtn = $("generate-btn");
  const progressWrap = $("plaque-progress-wrap");
  const progressFill = $("plaque-progress-fill");
  const progressText = $("plaque-progress-text");

  if (
    !textZone || !plaqueBase || !overlay || !overlayInput ||
    !logoMode || !oneLogoSide || !oneLogoInput || !pictoLeft || !pictoRight ||
    !generateBtn || !progressWrap || !progressFill || !progressText
  ) {
    console.error("Configurateur introuvable.");
    return;
  }

  const SERVER_BASE = "https://plaque-ia-production.up.railway.app";
  const GENERATE_ENDPOINT = `${SERVER_BASE}/generate-plaque-base`;

  const PLAQUE_BACKGROUNDS = {
    "acier brossé": "https://cdn.shopify.com/s/files/1/0267/9436/1022/files/acier-fd.png",
    "blanc": "https://cdn.shopify.com/s/files/1/0267/9436/1022/files/blanc-fd.png",
    "cuivre": "https://cdn.shopify.com/s/files/1/0267/9436/1022/files/cuivre-fd.png",
    "gris": "https://cdn.shopify.com/s/files/1/0267/9436/1022/files/gris-fd.png",
    "noir brillant": "https://cdn.shopify.com/s/files/1/0267/9436/1022/files/noirm-fd.png",
    "noir": "https://cdn.shopify.com/s/files/1/0267/9436/1022/files/noir-fd.png",
    "noyer": "https://cdn.shopify.com/s/files/1/0267/9436/1022/files/noyer-fd.png",
    "or brossé": "https://cdn.shopify.com/s/files/1/0267/9436/1022/files/or-fd.png",
    "rose": "https://cdn.shopify.com/s/files/1/0267/9436/1022/files/rose-fd.png"
  };

  const lineSizes = {
    1: 32,
    2: 22,
    3: 18
  };

  const lineMin = {
    1: 16,
    2: 12,
    3: 10
  };

  const lineMax = {
    1: 60,
    2: 48,
    3: 40
  };

  function updateLineStyles() {
    textZone.style.setProperty("--line1-size", `${lineSizes[1]}px`);
    textZone.style.setProperty("--line2-size", `${lineSizes[2]}px`);
    textZone.style.setProperty("--line3-size", `${lineSizes[3]}px`);

    textZone.style.setProperty("--line1-font", fontSelects[1].value);
    textZone.style.setProperty("--line2-font", fontSelects[2].value);
    textZone.style.setProperty("--line3-font", fontSelects[3].value);

    sizeDisplays[1].value = `${Math.round((lineSizes[1] / 32) * 100)}%`;
    sizeDisplays[2].value = `${Math.round((lineSizes[2] / 22) * 100)}%`;
    sizeDisplays[3].value = `${Math.round((lineSizes[3] / 18) * 100)}%`;
  }

  function updatePreviewText() {
    lineEls[1].textContent = lineInputs[1].value || "";
    lineEls[2].textContent = lineInputs[2].value || "";
    lineEls[3].textContent = lineInputs[3].value || "";
    updateLineStyles();
  }

  function updateLogoFieldsVisibility() {
    const mode = logoMode.value;

    oneLogoSideWrap.style.display = mode === "one" ? "grid" : "none";
    oneLogoInputWrap.style.display = mode === "one" ? "grid" : "none";

    leftLogoInputWrap.style.display = mode === "two" ? "grid" : "none";
    rightLogoInputWrap.style.display = mode === "two" ? "grid" : "none";

    textZone.classList.remove("logo-none", "logo-left", "logo-right", "logo-two");

    if (mode === "none") {
      textZone.classList.add("logo-none");
    } else if (mode === "one" && oneLogoSide.value === "left") {
      textZone.classList.add("logo-left");
    } else if (mode === "one" && oneLogoSide.value === "right") {
      textZone.classList.add("logo-right");
    } else {
      textZone.classList.add("logo-two");
    }
  }

  function getSelectedVariant() {
    const variantIdInput = document.querySelector('input[name="id"]');
    if (!variantIdInput || !window.productVariants) return null;

    const variantId = variantIdInput.value;
    return window.productVariants.find(
      (variant) => String(variant.id) === String(variantId)
    ) || null;
  }

  function getSelectedColor() {
    const variant = getSelectedVariant();
    if (!variant) return "blanc";

    const options = variant.options || [];

    for (const opt of options) {
      const value = String(opt).toLowerCase();

      if (value.includes("acier")) return "acier brossé";
      if (value.includes("cuivre")) return "cuivre";
      if (value.includes("or")) return "or brossé";
      if (value.includes("blanc")) return "blanc";
      if (value.includes("noir brillant")) return "noir brillant";
      if (value.includes("noir")) return "noir";
      if (value.includes("noyer")) return "noyer";
      if (value.includes("gris")) return "gris";
      if (value.includes("rose")) return "rose";
    }

    return "blanc";
  }

  function getEngravingColor(plateColor) {
    const color = plateColor.toLowerCase();

    const blackEngraving = ["acier brossé", "cuivre", "or brossé", "blanc"];
    const whiteEngraving = ["rose", "noyer", "gris", "noir", "noir brillant"];

    if (blackEngraving.some((c) => color.includes(c))) return "black";
    if (whiteEngraving.some((c) => color.includes(c))) return "white";

    return "black";
  }

  function updatePlaqueBackground(plateColor) {
    const color = plateColor.toLowerCase();

    for (const key in PLAQUE_BACKGROUNDS) {
      if (color.includes(key)) {
        plaqueBase.src = PLAQUE_BACKGROUNDS[key];
        return;
      }
    }

    plaqueBase.src = PLAQUE_BACKGROUNDS["blanc"];
  }

  function bindVariantListeners() {
    const variantSelectors = document.querySelectorAll(
      'input[name="id"], .product-form__input input[type="radio"], .product-form__input select, variant-selects select, variant-radios input'
    );

    variantSelectors.forEach((el) => {
      el.addEventListener("change", () => {
        updatePlaqueBackground(getSelectedColor());
      });
    });
  }

  function getLogoPayload() {
    const mode = logoMode.value;

    if (mode === "none") {
      return { leftIcon: "", rightIcon: "" };
    }

    if (mode === "one") {
      const icon = oneLogoInput.value.trim();
      if (oneLogoSide.value === "left") {
        return { leftIcon: icon, rightIcon: "" };
      }
      return { leftIcon: "", rightIcon: icon };
    }

    return {
      leftIcon: pictoLeft.value.trim(),
      rightIcon: pictoRight.value.trim()
    };
  }

  let progressTimer = null;

  function startProgress() {
    progressWrap.hidden = false;
    progressFill.style.width = "0%";
    progressText.textContent = "Préparation de votre plaque...";
    let value = 0;

    clearInterval(progressTimer);
    progressTimer = setInterval(() => {
      if (value < 88) {
        value += Math.random() * 12;
        progressFill.style.width = `${Math.min(value, 88)}%`;
      }

      if (value < 30) {
        progressText.textContent = "Analyse de votre demande...";
      } else if (value < 60) {
        progressText.textContent = "Création des logos par l’IA...";
      } else {
        progressText.textContent = "Finalisation de votre plaque...";
      }
    }, 300);
  }

  function finishProgress() {
    clearInterval(progressTimer);
    progressFill.style.width = "100%";
    progressText.textContent = "Plaque générée";
    setTimeout(() => {
      progressWrap.hidden = true;
      progressFill.style.width = "0%";
      progressText.textContent = "Préparation...";
    }, 800);
  }

  function failProgress() {
    clearInterval(progressTimer);
    progressFill.style.width = "0%";
    progressText.textContent = "Erreur de génération";
    setTimeout(() => {
      progressWrap.hidden = true;
      progressText.textContent = "Préparation...";
    }, 1200);
  }

  [1, 2, 3].forEach((index) => {
    lineInputs[index].addEventListener("input", updatePreviewText);
    fontSelects[index].addEventListener("change", updatePreviewText);

    minusBtns[index].addEventListener("click", () => {
      lineSizes[index] = Math.max(lineMin[index], lineSizes[index] - 2);
      updateLineStyles();
    });

    plusBtns[index].addEventListener("click", () => {
      lineSizes[index] = Math.min(lineMax[index], lineSizes[index] + 2);
      updateLineStyles();
    });
  });

  logoMode.addEventListener("change", updateLogoFieldsVisibility);
  oneLogoSide.addEventListener("change", updateLogoFieldsVisibility);

  updatePreviewText();
  updateLogoFieldsVisibility();
  updatePlaqueBackground(getSelectedColor());
  bindVariantListeners();

  generateBtn.addEventListener("click", async () => {
    generateBtn.disabled = true;
    generateBtn.textContent = "Génération en cours...";
    startProgress();

    try {
      const plateColor = getSelectedColor();
      const engravingColor = getEngravingColor(plateColor);
      const logos = getLogoPayload();

      updatePlaqueBackground(plateColor);

      const payload = {
        plateColor,
        engravingColor,
        leftIcon: logos.leftIcon,
        rightIcon: logos.rightIcon,
        style: "premium"
      };

      const response = await fetch(GENERATE_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const rawText = await response.text();

      let data = {};
      try {
        data = JSON.parse(rawText);
      } catch (e) {
        throw new Error("Le serveur n'a pas renvoyé du JSON : " + rawText);
      }

      if (!response.ok) {
        throw new Error(data.details || data.error || `HTTP ${response.status}`);
      }

      const returnedUrl = data.preview?.url || data.url;
      if (!returnedUrl) {
        throw new Error("Pas d'image renvoyée par le serveur.");
      }

      const imageUrl = returnedUrl.startsWith("http")
        ? returnedUrl
        : `${SERVER_BASE}${returnedUrl}`;

      overlay.src = imageUrl;
      overlayInput.value = imageUrl;

      finishProgress();
    } catch (e) {
      console.error("Erreur génération complète :", e);
      failProgress();
      alert("Erreur génération : " + e.message);
    } finally {
      generateBtn.disabled = false;
      generateBtn.textContent = "Générer ma plaque par l’IA";
    }
  });
});
