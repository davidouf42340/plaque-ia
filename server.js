document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  const line1Input = $("input-line1");
  const line2Input = $("input-line2");
  const line3Input = $("input-line3");

  const line1 = $("line1");
  const line2 = $("line2");
  const line3 = $("line3");

  const fontSelect = $("font-select");
  const textLayer = $("plaque-text");

  const fontMinus = $("font-minus");
  const fontPlus = $("font-plus");
  const fontSizeDisplay = $("font-size-display");

  const pictoLeft = $("picto-left");
  const pictoRight = $("picto-right");
  const backgroundDecor = $("background-decor");

  const generateBtn = $("generate-btn");
  const overlay = $("plaque-overlay");
  const overlayInput = $("overlay-url");
  const plaqueBase = $("plaque-base");

  if (
    !line1Input ||
    !line2Input ||
    !line3Input ||
    !line1 ||
    !line2 ||
    !line3 ||
    !fontSelect ||
    !textLayer ||
    !fontMinus ||
    !fontPlus ||
    !fontSizeDisplay ||
    !pictoLeft ||
    !pictoRight ||
    !backgroundDecor ||
    !generateBtn ||
    !overlay ||
    !overlayInput ||
    !plaqueBase
  ) {
    console.error("Configurateur introuvable.");
    return;
  }

  const SERVER_BASE = "https://simulateur-pag.up.railway.app";
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

  let fontScale = 1;

  function updateFontScale() {
    textLayer.style.setProperty("--font-scale", String(fontScale));
    fontSizeDisplay.value = `${Math.round(fontScale * 100)}%`;
  }

  function updatePreviewText() {
    line1.textContent = line1Input.value || "";
    line2.textContent = line2Input.value || "";
    line3.textContent = line3Input.value || "";
    textLayer.style.fontFamily = fontSelect.value || "Arial, sans-serif";
    updateFontScale();
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

    const blackEngraving = [
      "acier brossé",
      "cuivre",
      "or brossé",
      "blanc"
    ];

    const whiteEngraving = [
      "rose",
      "noyer",
      "gris",
      "noir",
      "noir brillant"
    ];

    if (blackEngraving.some((c) => color.includes(c))) {
      return "black";
    }

    if (whiteEngraving.some((c) => color.includes(c))) {
      return "white";
    }

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
        const plateColor = getSelectedColor();
        updatePlaqueBackground(plateColor);
      });
    });
  }

  fontMinus.addEventListener("click", () => {
    fontScale = Math.max(0.6, Number((fontScale - 0.1).toFixed(2)));
    updateFontScale();
  });

  fontPlus.addEventListener("click", () => {
    fontScale = Math.min(1.8, Number((fontScale + 0.1).toFixed(2)));
    updateFontScale();
  });

  line1Input.addEventListener("input", updatePreviewText);
  line2Input.addEventListener("input", updatePreviewText);
  line3Input.addEventListener("input", updatePreviewText);
  fontSelect.addEventListener("change", updatePreviewText);

  updatePreviewText();
  updatePlaqueBackground(getSelectedColor());
  bindVariantListeners();

  generateBtn.addEventListener("click", async () => {
    generateBtn.disabled = true;
    generateBtn.textContent = "Génération...";

    try {
      const plateColor = getSelectedColor();
      const engravingColor = getEngravingColor(plateColor);

      updatePlaqueBackground(plateColor);

      const response = await fetch(GENERATE_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          plateColor,
          engravingColor,
          leftIcon: pictoLeft.value || "",
          rightIcon: pictoRight.value || "",
          backgroundDecor: backgroundDecor.value || "",
          style: "premium"
        })
      });

      const rawText = await response.text();
      let data = {};

      try {
        data = JSON.parse(rawText);
      } catch (e) {
        throw new Error(`Réponse non JSON : ${rawText}`);
      }

      if (!response.ok) {
        throw new Error(data.error || data.details || `HTTP ${response.status}`);
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

      console.log("Overlay généré :", {
        plateColor,
        engravingColor,
        imageUrl
      });
    } catch (e) {
      console.error("Erreur génération :", e);
      alert("Erreur génération : " + e.message);
    } finally {
      generateBtn.disabled = false;
      generateBtn.textContent = "Générer le style";
    }
  });
});
