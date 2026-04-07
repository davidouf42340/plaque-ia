<script>
  // Scroll vers le configurateur si on vient de la galerie réalisations ou galerie IA
  if(localStorage.getItem("pagRealizedIdea") || localStorage.getItem("pagProjectSelection")){
    document.addEventListener("DOMContentLoaded", function(){
      setTimeout(function(){
        var s = document.getElementById("plaque-ai-configurator");
        if(s){
          var top = s.getBoundingClientRect().top + window.pageYOffset - 16;
          window.scrollTo({top: top, behavior: "smooth"});
        }
      }, 200);
    });
  }
</script>
<section id="plaque-ai-configurator" class="pag-ai">
  <div class="page-width pag-ai-wrap">
    <script>
      // Charge les données produit — fonctionne sur page produit ET page dédiée
      {% if product != blank %}
        window.productData = {{ product | json }};
      {% else %}
        // Page dédiée : charge via API
        fetch("/products/plaque-de-boite-aux-lettre-assistee-par-ia.json")
          .then(function(r){return r.json();})
          .then(function(d){
            if(d&&d.product){
              window.productData = d.product;
              // Réinitialise les selects avec les vraies données
              if(typeof updateDimensionSelect==="function") updateDimensionSelect();
              if(typeof updateThicknessOptions==="function") updateThicknessOptions();
              if(typeof refreshVariant==="function" && window.pagState && window.pagState.selectedColor) refreshVariant(function(){});
            }
          })
          .catch(function(e){console.error("Erreur chargement produit:",e);});
      {% endif %}
    </script>
    <div class="pag-ai-hero">
      <p class="pag-ai-kicker">Configurateur intelligent</p>
      <h1>La plaque assistée par IA</h1>
      <p class="pag-ai-sub">Créez votre plaque étape par étape, avec ou sans visuel généré par IA.</p>
    </div>
    <div class="pag-ai-progress"><div class="pag-ai-progress-bar" id="globalProgressBar"></div></div>

    <!-- Popup humoristique pendant la génération IA -->
    <div id="pagFunOverlay" class="pag-fun-overlay">
      <div class="pag-fun-box">
        <div class="pag-fun-icon-wrap">
          <span id="pagFunIcon" class="pag-fun-icon">☕</span>
        </div>
        <p id="pagFunMsg" class="pag-fun-msg">Profitez-en pour boire un café…</p>
        <p id="pagFunSub" class="pag-fun-sub">Notre IA se met au travail !</p>
        <div class="pag-fun-bar-wrap"><div id="pagFunBar" class="pag-fun-bar"></div></div>
        <div class="pag-fun-footer">
          <span class="pag-fun-label">Génération en cours</span>
          <span id="pagFunPct" class="pag-fun-pct">0%</span>
        </div>
      </div>
    </div>

    <div id="step-1" class="pag-step is-active">
      <h2>Souhaitez-vous intégrer des images sur votre plaque, assistées par notre intelligence artificielle&nbsp;?</h2>
      <div class="pag-choice-grid two">
        <button class="pag-choice-btn pag-choice-big" data-logo-ai="yes" type="button">
          <span class="pag-choice-icon">
            <svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="52" height="52" rx="16" fill="rgba(124,58,237,0.18)"/>
              <!-- Cadre photo -->
              <rect x="8" y="12" width="28" height="22" rx="4" stroke="#a78bfa" stroke-width="2" fill="none"/>
              <!-- Montagne + soleil dans photo -->
              <circle cx="19" cy="20" r="3" fill="rgba(196,181,253,0.4)" stroke="#c4b5fd" stroke-width="1.5"/>
              <path d="M9 30l6-7 4 5 4-4 8 6H9z" fill="rgba(124,58,237,0.35)" stroke="#a78bfa" stroke-width="1" stroke-linejoin="round"/>
              <!-- Étoile IA -->
              <circle cx="38" cy="16" r="9" fill="rgba(124,58,237,0.9)" stroke="rgba(168,85,247,0.6)" stroke-width="1"/>
              <path d="M38 11l1.2 3.8H43l-3 2.2 1.1 3.8L38 18.7l-3.1 2.1 1.1-3.8-3-2.2h3.8z" fill="#fff"/>
            </svg>
          </span>
          <span class="pag-choice-label">Avec image(s)</span>
          <span class="pag-choice-sub">Générez un visuel par IA</span>
        </button>
        <button class="pag-choice-btn pag-choice-big" data-logo-ai="no" type="button">
          <span class="pag-choice-icon">
            <svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="52" height="52" rx="16" fill="rgba(124,58,237,0.18)"/>
              <!-- Plaque avec lignes de texte -->
              <rect x="8" y="14" width="36" height="24" rx="5" stroke="#a78bfa" stroke-width="2" fill="rgba(124,58,237,0.08)"/>
              <!-- Lignes de texte stylisées -->
              <rect x="14" y="20" width="24" height="3" rx="1.5" fill="#c4b5fd"/>
              <rect x="16" y="26" width="20" height="2.5" rx="1.25" fill="rgba(167,139,250,0.6)"/>
              <rect x="18" y="31" width="16" height="2" rx="1" fill="rgba(124,58,237,0.5)"/>
              <!-- Curseur d'écriture -->
              <rect x="38" y="19" width="2" height="5" rx="1" fill="#7c3aed"/>
            </svg>
          </span>
          <span class="pag-choice-label">Sans image</span>
          <span class="pag-choice-sub">Texte uniquement</span>
        </button>
      </div>
    </div>

    <div id="step-2" class="pag-step">
      <h2>Combien d'images souhaitez-vous&nbsp;?</h2>
      <div class="pag-config-grid">
        <button type="button" class="pag-config-card" data-logo-count="1">
          <div class="pag-config-plate"><img src="https://cdn.shopify.com/s/files/1/0267/9436/1022/files/1image.png?v=1774347806" alt="1 image" class="pag-config-plate-img"></div>
          <div class="pag-config-badge">1 image</div><div class="pag-config-note">Une image à gauche ou à droite</div>
        </button>
        <button type="button" class="pag-config-card" data-logo-count="2">
          <div class="pag-config-plate"><img src="https://cdn.shopify.com/s/files/1/0267/9436/1022/files/2images.png?v=1774347806" alt="2 images" class="pag-config-plate-img"></div>
          <div class="pag-config-badge">2 images</div><div class="pag-config-note">Une image de chaque côté</div>
        </button>
      </div>
      <div class="pag-actions"><button type="button" class="pag-btn pag-btn-secondary" data-prev="1">Retour</button></div>
    </div>

    <div id="step-2b" class="pag-step">
      <h2>D'où viennent vos images&nbsp;?</h2>
      <p class="pag-source-sub">Parcourez les créations de nos clients ou générez vos propres images avec l'IA.</p>
      <div class="pag-config-grid">
        <button type="button" class="pag-source-card" id="srcGalleryBtn">
          <div class="pag-source-icon">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="36" height="36" rx="10" fill="rgba(124,58,237,0.2)"/>
              <rect x="6" y="8" width="10" height="10" rx="2" fill="#7c3aed" opacity="0.8"/>
              <rect x="20" y="8" width="10" height="10" rx="2" fill="#a78bfa" opacity="0.7"/>
              <rect x="6" y="21" width="10" height="8" rx="2" fill="#a78bfa" opacity="0.6"/>
              <rect x="20" y="21" width="10" height="8" rx="2" fill="#7c3aed" opacity="0.9"/>
            </svg>
          </div>
          <div class="pag-source-label">Galerie communauté</div>
          <div class="pag-source-desc">Gratuit et instantané</div>
          <div class="pag-source-badge">Recommandé</div>
        </button>
        <button type="button" class="pag-source-card" id="srcAiBtn">
          <div class="pag-source-icon">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="36" height="36" rx="10" fill="rgba(124,58,237,0.2)"/>
              <circle cx="18" cy="16" r="6" stroke="#c4b5fd" stroke-width="1.5" fill="none"/>
              <path d="M18 10v-3M18 25v-3M10 16H7M29 16h-3" stroke="#a78bfa" stroke-width="1.5" stroke-linecap="round"/>
              <circle cx="18" cy="16" r="2.5" fill="#7c3aed"/>
              <path d="M14 26h8" stroke="#c4b5fd" stroke-width="1.5" stroke-linecap="round"/>
              <path d="M16 28h4" stroke="#a78bfa" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </div>
          <div class="pag-source-label">Générer avec l'IA</div>
          <div class="pag-source-desc">Décrivez, on crée</div>
        </button>
      </div>
      <div class="pag-actions"><button type="button" class="pag-btn pag-btn-secondary" data-prev="2">Retour</button></div>
    </div>

    <div id="step-2c" class="pag-step">
      <h2 id="galleryStepTitle">Choisissez dans la galerie</h2>
      <p id="galleryStepHint" class="pag-source-sub">Sélectionnez vos images.</p>

      <!-- Toolbar galerie style gallery.liquid -->
      <div class="pag-gal2-toolbar">
        <div class="pag-gal2-search-wrap">
          <input type="text" id="galSearch" class="pag-gal-search" placeholder="🔍 Rechercher…" autocomplete="off">
        </div>
        <div class="pag-gal2-special-filters">
          <button type="button" class="pag-gal2-special-btn is-active" id="galFilterAll">Toutes</button>
          <button type="button" class="pag-gal2-special-btn" id="galFilterTopRated">⭐ Mieux notées</button>
          <button type="button" class="pag-gal2-special-btn" id="galFilterMostUsed">🔥 Plus utilisées</button>
        </div>
        <div id="galCategories" class="pag-gal-cats"></div>
        <div class="pag-gal2-sticky-bar">
          <button type="button" class="pag-btn pag-btn-secondary" id="galleryBackBtnTop">Retour</button>
          <span id="galleryStepCount">0 / 6 images sélectionnées</span>
          <button type="button" class="pag-btn pag-btn-primary" id="validateGalleryBtnTop" disabled>Valider ma sélection →</button>
        </div>
      </div>

      <div id="galleryLoading" style="text-align:center;padding:24px;color:rgba(255,255,255,.5);">Chargement…</div>
      <div id="galleryEmpty" style="display:none;text-align:center;padding:20px;color:rgba(255,255,255,.4);">Aucune image pour ce filtre.</div>
      <div id="galleryGrid" class="pag-gal2-grid"></div>

      <div id="gallerySecondChoice" style="display:none;background:rgba(124,58,237,.08);border:1px solid rgba(124,58,237,.3);border-radius:14px;padding:16px;margin-top:14px;">
        <p style="color:#ddd6fe;font-size:14px;margin:0 0 12px;">✓ <strong>1 image sélectionnée.</strong> Pour la 2ème image :</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button type="button" class="pag-btn pag-btn-secondary" id="galleryPickSecondBtn" style="flex:1;font-size:14px;padding:12px;">Choisir dans la galerie</button>
          <button type="button" class="pag-btn pag-btn-primary" id="galleryGenerateSecondBtn" style="flex:1;font-size:14px;padding:12px;">✨ Générer avec l'IA</button>
        </div>
      </div>
      <div class="pag-actions">
        <button type="button" class="pag-btn pag-btn-secondary" id="galleryBackBtn">Retour</button>
        <button type="button" class="pag-btn pag-btn-primary" id="validateGalleryBtn" disabled>Valider ma sélection</button>
      </div>
    </div>

    <div id="step-3" class="pag-step">
      <h2 id="logoPromptTitle">Décrivez votre image</h2>
      <div id="logoGenerationWarning" class="pag-logo-warning"></div>
      <div class="pag-ia-help">
        <div class="pag-ia-help-title">💡 Comment bien décrire votre image à l'IA&nbsp;?</div>
        <ul class="pag-ia-help-list">
          <li><strong>Soyez précis</strong><br><span class="pag-ia-example">✅ "Tête de rottweiler de profil" · ✅ "Ciseaux de coiffure ouverts"</span></li>
          <li><strong>Précisez le style</strong> — pictogramme, silhouette, minimaliste…<br><span class="pag-ia-example">✅ "Silhouette d'un palmier" · ✅ "Pictogramme ancre de bateau"</span></li>
          <li><strong>5 à 10 mots suffisent</strong><br><span class="pag-ia-example">✅ "Silhouette chien qui court"</span></li>
          <li><strong>L'image sera en noir</strong> sur fond transparent.</li>
        </ul>
      </div>
      <div id="logoPromptSingle">
        <label for="logoPrompt1">Décrivez votre image en quelques mots</label>
        <textarea id="logoPrompt1" class="pag-prompt-textarea" rows="3" placeholder="Ex : Tête de rottweiler de profil, style pictogramme&#10;Ex : Ciseaux de coiffure ouverts, minimaliste"></textarea>
      </div>
      <div id="logoPromptDouble" style="display:none;">
        <label for="logoPromptLeft">Image de gauche</label>
        <textarea id="logoPromptLeft" class="pag-prompt-textarea" rows="2" placeholder="Ex : Croix de pharmacie, style pictogramme"></textarea>
        <label for="logoPromptRight" style="margin-top:12px;">Image de droite</label>
        <textarea id="logoPromptRight" class="pag-prompt-textarea" rows="2" placeholder="Ex : Mortier et pilon, minimaliste"></textarea>
      </div>
      <div class="pag-actions">
        <button type="button" class="pag-btn pag-btn-secondary" id="backFromPromptBtn">Retour</button>
        <button type="button" class="pag-btn pag-btn-primary pag-btn-glow" id="generateLogosBtn">Générer mes images</button>
      </div>
      <div id="logoLoadingBlock" class="pag-loading" style="display:none;">
        <div class="pag-loading-head">
          <div class="pag-loading-head-left"><span class="pag-loading-dot"></span><span id="loadingMessage">Analyse…</span></div>
          <span id="loadingPercent" class="pag-loading-percent">0%</span>
        </div>
        <div class="pag-loading-track"><div class="pag-loading-fill" id="loadingFill"></div></div>
      </div>
      <div id="logoErrorBox" class="pag-error-box" style="display:none;"></div>
    </div>

    <div id="step-4" class="pag-step">
      <h2 id="step4Title">Sélectionnez et positionnez vos images</h2>
      <div id="step4Content"></div>
      <div class="pag-actions">
        <button type="button" class="pag-btn pag-btn-secondary" id="backFromStep4Btn">Retour</button>
        <button type="button" class="pag-btn pag-btn-primary" id="validateLogosBtn">Valider</button>
      </div>
      <div id="logoErrorBox2" class="pag-error-box" style="display:none;"></div>
    </div>

    <div id="step-5" class="pag-step">
      <h2>Saisissez votre texte</h2>
      <p class="pag-textarea-hint">Appuyez sur <kbd>Entrée</kbd> pour aller à la ligne (4 lignes max)</p>
      <textarea id="textInput" class="pag-textarea" rows="4" maxlength="200" placeholder="Ligne 1&#10;Ligne 2&#10;Ligne 3&#10;Ligne 4"></textarea>
      <div class="pag-textarea-count"><span id="lineCount">0</span> / 4 lignes</div>
      <div class="pag-actions">
        <button type="button" class="pag-btn pag-btn-secondary" id="backFromText">Retour</button>
        <button type="button" class="pag-btn pag-btn-primary" id="validateTextBtn">Valider mon texte</button>
      </div>
    </div>

    <div id="step-6" class="pag-step">
      <h2>Choisissez votre couleur</h2>
      <div id="previewGrid" class="pag-preview-grid"></div>
      <div class="pag-actions"><button type="button" class="pag-btn pag-btn-secondary" data-prev="5">Retour</button></div>
    </div>

    <div id="step-7" class="pag-step">
      <h2>Personnalisez votre plaque</h2>
      <div class="pag-canvas-wrap">
        <canvas id="previewCanvas" class="pag-preview-canvas"></canvas>
        <div class="pag-canvas-loading" id="canvasLoading">Chargement des polices…</div>
      </div>
      <div class="pag-customize-panel">
        <div class="pag-customize-row">
          <label class="pag-customize-label">Votre texte</label>
          <p class="pag-textarea-hint" style="margin:0 0 8px;">Entrée pour changer de ligne (4 lignes max)</p>
          <textarea id="textInputStep7" class="pag-textarea" rows="4" maxlength="200" placeholder="Ligne 1&#10;Ligne 2&#10;Ligne 3&#10;Ligne 4"></textarea>
          <div class="pag-textarea-count"><span id="lineCountStep7">0</span> / 4 lignes</div>
        </div>
        <div class="pag-customize-row">
          <label class="pag-customize-label">Alignement</label>
          <div class="pag-align-group">
            <button type="button" class="pag-align-btn is-selected" data-align="center">Centré</button>
            <button type="button" class="pag-align-btn" data-align="left">Gauche</button>
            <button type="button" class="pag-align-btn" data-align="right">Droite</button>
          </div>
        </div>
        <div class="pag-customize-row" id="swapLogosRow" style="display:none;">
          <button type="button" id="swapLogosBtn" class="pag-btn pag-btn-secondary" style="width:100%;">⇄ Inverser les images</button>
        </div>
        <div class="pag-customize-row">
          <label class="pag-customize-label">Retourner une image</label>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <button type="button" id="flipLeftStep7" class="pag-flip-btn">↔ Retourner gauche</button>
            <button type="button" id="flipRightStep7" class="pag-flip-btn" style="display:none;">↔ Retourner droite</button>
          </div>
        </div>
        <div class="pag-customize-row">
          <label class="pag-customize-label">Police</label>
          <select id="fontSelect" class="pag-font-select"></select>
        </div>
        <div class="pag-customize-row">
          <label class="pag-customize-label">Taille du texte</label>
          <div class="pag-size-row">
            <input type="range" id="fontSizeSlider" class="pag-size-slider" min="8" max="160" step="1" value="60">
            <span id="fontSizeValue" class="pag-size-value">60px</span>
          </div>
        </div>
      </div>
      <div class="pag-actions">
        <button type="button" class="pag-btn pag-btn-secondary" data-prev="6">Retour</button>
        <button type="button" class="pag-btn pag-btn-primary" id="validateCustomizeBtn">Je valide</button>
      </div>
    </div>

    <div id="step-8" class="pag-step">
      <h2>Choisissez la dimension</h2>
      <select id="dimensionSelect"></select>
      <div class="pag-actions">
        <button type="button" class="pag-btn pag-btn-secondary" data-prev="7">Retour</button>
        <button type="button" class="pag-btn pag-btn-primary" id="validateDimensionBtn">Valider</button>
      </div>
    </div>

    <div id="step-9" class="pag-step">
      <h2>Choisissez l'épaisseur</h2>
      <select id="thicknessSelect">
        <option value="1.6">1,6 mm</option>
        <option value="3.2">3,2 mm</option>
      </select>
      <div id="thicknessSurcharge" class="pag-thickness-surcharge" style="display:none;"></div>
      <div class="pag-actions">
        <button type="button" class="pag-btn pag-btn-secondary" data-prev="8">Retour</button>
        <button type="button" class="pag-btn pag-btn-primary" id="validateThicknessBtn">Valider</button>
      </div>
    </div>

    <div id="step-10" class="pag-step">
      <h2>Récapitulatif de votre plaque</h2>
      <div class="pag-canvas-wrap"><canvas id="summaryCanvas" class="pag-preview-canvas"></canvas></div>
      <div class="pag-summary-details">
        <p><strong>Couleur :</strong> <span id="summaryColor">--</span></p>
        <p><strong>Dimension :</strong> <span id="summaryDimension">--</span></p>
        <p><strong>Épaisseur :</strong> <span id="summaryThickness">--</span></p>
        <p><strong>Texte :</strong> <span id="summaryText">--</span></p>
        <p><strong>Police :</strong> <span id="summaryFont">--</span></p>
        <p class="pag-price"><strong>Prix :</strong> <span id="finalPrice">--</span></p>
      </div>
      <div class="pag-actions">
        <button type="button" class="pag-btn pag-btn-secondary" data-prev="9">Retour</button>
        <button type="button" class="pag-btn pag-btn-primary pag-btn-glow" id="addToCartBtn">Ajouter au panier</button>
      </div>
    </div>
  </div>
</section>

<style>
  html{scroll-behavior:auto!important}
  .pag-ai{--pag-violet:#7c3aed;--pag-violet-dark:#6d28d9;--pag-border:rgba(255,255,255,.12);--pag-card:rgba(255,255,255,.04);color:#fff}
  .pag-ai-wrap{max-width:980px;margin:0 auto;padding:24px 0 40px}
  .pag-ai-hero{margin-bottom:22px}
  .pag-ai-kicker{margin:0 0 6px;color:#c4b5fd;letter-spacing:.08em;text-transform:uppercase;font-size:12px;font-weight:700}
  .pag-ai h1{margin:0 0 10px;font-size:clamp(26px,4vw,56px);line-height:1.02;font-weight:800;color:#fff}
  .pag-ai-sub{margin:0;color:rgba(255,255,255,.72);font-size:16px}
  .pag-ai-progress{height:8px;background:rgba(255,255,255,.08);border-radius:999px;overflow:hidden;margin:0 0 26px}
  .pag-ai-progress-bar{height:100%;width:0%;background:linear-gradient(90deg,#8b5cf6,#7c3aed);transition:width .35s ease}
  .pag-step{display:none;background:var(--pag-card);border:1px solid var(--pag-border);border-radius:22px;padding:24px;box-shadow:0 8px 30px rgba(0,0,0,.18);margin-bottom:20px;scroll-margin-top:90px}
  .pag-step.is-active{display:block!important}
  .pag-step h2{margin:0 0 18px;font-size:clamp(18px,3vw,30px);line-height:1.15;color:#fff}
  .pag-step label,.pag-customize-label{display:block;margin:0 0 8px;font-weight:700;color:#fff}
  .pag-step select{width:100%;border-radius:14px;border:1px solid rgba(255,255,255,.14);background:#fff;color:#000;padding:14px 16px;font-size:16px;margin:0 0 16px;box-sizing:border-box}
  .pag-choice-grid{display:grid;gap:14px;margin:0 0 18px}
  .pag-choice-grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}
  .pag-choice-grid.compact{max-width:420px}
  .pag-choice-btn{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:#fff;border-radius:16px;padding:14px 12px;font-size:15px;font-weight:700;cursor:pointer;transition:.2s ease;text-align:center}
  .pag-choice-btn.is-selected{border:2px solid var(--pag-violet);box-shadow:0 0 0 4px rgba(124,58,237,.16);background:rgba(124,58,237,.12)}
  .pag-choice-big{display:flex;flex-direction:column;align-items:center;gap:6px;padding:20px 14px}
  .pag-source-icon{display:flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:14px;background:rgba(124,58,237,.12);border:1px solid rgba(124,58,237,.25);margin-bottom:6px}
  .pag-choice-label{font-size:17px;font-weight:800}
  .pag-choice-sub{font-size:12px;color:rgba(255,255,255,.6);font-weight:400}
  .pag-config-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin-top:12px}
  .pag-config-card{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);border-radius:20px;padding:8px 8px 16px;cursor:pointer;transition:.25s ease;text-align:left;color:#fff}
  .pag-config-card.is-selected{border:2px solid var(--pag-violet);background:rgba(124,58,237,.10)}
  .pag-config-plate{width:100%;border-radius:0;overflow:hidden;margin-bottom:14px;line-height:0}
  .pag-config-plate-img{width:100%;height:auto;display:block}
  .pag-config-badge{font-size:20px;font-weight:800;color:#fff;margin-bottom:6px}
  .pag-config-note{color:rgba(255,255,255,.72);font-size:14px;line-height:1.35}
  .pag-source-sub{color:rgba(255,255,255,.6);font-size:14px;margin:0 0 16px}
  .pag-source-card{position:relative;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:#fff;border-radius:18px;padding:20px 14px;cursor:pointer;transition:.2s ease;text-align:center;display:flex;flex-direction:column;align-items:center;gap:6px;width:100%}
  .pag-source-card:hover{border-color:rgba(124,58,237,.7);background:rgba(124,58,237,.08);transform:translateY(-2px)}
  .pag-source-label{font-size:16px;font-weight:800;color:#fff}
  .pag-source-desc{font-size:12px;color:rgba(255,255,255,.6)}
  .pag-source-badge{background:#7c3aed;color:#fff;font-size:11px;font-weight:800;border-radius:999px;padding:3px 10px;margin-top:4px;display:inline-block}
  .pag-ia-help{background:rgba(124,58,237,.08);border:1px solid rgba(124,58,237,.3);border-radius:16px;padding:16px 18px;margin:0 0 20px}
  .pag-ia-help-title{font-weight:800;color:#c4b5fd;font-size:15px;margin-bottom:12px}
  .pag-ia-help-list{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:10px;color:rgba(255,255,255,.85);font-size:14px;line-height:1.5}
  .pag-ia-example{display:inline-block;margin-top:4px;color:#a78bfa;font-size:13px;font-style:italic}
  .pag-prompt-textarea{width:100%;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:#fff;color:#000;padding:14px 16px;font-size:15px;font-family:inherit;line-height:1.55;resize:none;box-sizing:border-box;margin-bottom:14px}
  .pag-logo-warning,.pag-error-box{margin:0 0 18px;padding:14px 16px;border-radius:14px;background:rgba(124,58,237,.12);border:1px solid rgba(168,85,247,.45);color:#f3e8ff;font-size:14px;line-height:1.45}
  .pag-logo-warning strong{color:#c4b5fd}
  .pag-logo-warning-count{display:inline-block;margin-top:6px;color:#a78bfa;font-weight:800}
  .pag-loading{margin-top:18px;padding:18px;border-radius:18px;background:rgba(124,58,237,.08);border:1px solid rgba(124,58,237,.35)}
  .pag-loading-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;color:#ddd6fe;font-weight:700}
  .pag-loading-head-left{display:flex;align-items:center;gap:10px}
  .pag-loading-dot{width:10px;height:10px;border-radius:999px;background:#8b5cf6;animation:pagPulse 1.2s infinite}
  .pag-loading-percent{color:#a78bfa;font-weight:800;min-width:48px;text-align:right}
  @keyframes pagPulse{0%{transform:scale(.9);opacity:.7}50%{transform:scale(1.1);opacity:1}100%{transform:scale(.9);opacity:.7}}
  .pag-loading-track{position:relative;width:100%;height:12px;background:rgba(255,255,255,.10);border-radius:999px;overflow:visible}
  .pag-loading-fill{position:absolute;top:0;left:0;height:100%;width:0%;background:linear-gradient(90deg,#7c3aed,#a855f7);border-radius:999px;transition:width .4s cubic-bezier(0.4,0,0.2,1);will-change:width;min-width:0}
  /* Popup humoristique chargement */
  .pag-fun-overlay{position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:9999;display:none;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)}
  .pag-fun-overlay.is-open{display:flex}
  .pag-fun-box{background:#1a1a2e;border:1px solid rgba(124,58,237,.4);border-radius:24px;padding:32px 28px;max-width:380px;width:100%;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.6)}
  .pag-fun-icon{font-size:52px;margin-bottom:16px;display:block;animation:pagFunBounce 1s ease infinite alternate}
  .pag-fun-msg{font-size:18px;font-weight:800;color:#fff;line-height:1.4;margin:0 0 20px}
  .pag-fun-bar-wrap{height:8px;background:rgba(255,255,255,.08);border-radius:999px;overflow:visible;margin-bottom:12px;position:relative}
  .pag-fun-bar{position:absolute;top:0;left:0;height:100%;width:0%;background:linear-gradient(90deg,#7c3aed,#a855f7);border-radius:999px;transition:width .4s cubic-bezier(0.4,0,0.2,1);will-change:width}
  .pag-fun-pct{font-size:13px;color:#a78bfa;font-weight:800}
  @keyframes pagFunBounce{0%{transform:translateY(0) scale(1)}100%{transform:translateY(-8px) scale(1.08)}}

  .pag-logo-grid,.pag-preview-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin:16px 0}
  .pag-logo-card,.pag-preview-card{border:none;background:none;padding:0;cursor:pointer;transition:.2s ease;border-radius:16px}
  .pag-logo-card.is-selected,.pag-preview-card.is-selected{outline:3px solid #7c3aed;box-shadow:0 0 0 4px rgba(124,58,237,.2);border-radius:16px;background:#fff}
  .pag-logo-thumb{background:#fff;border-radius:14px;min-height:110px;display:flex;align-items:center;justify-content:center;padding:10px}
  .pag-logo-thumb img{max-width:100%;max-height:90px;object-fit:contain;display:block;margin:0 auto}
  .pag-pos-hint{font-size:13px;color:rgba(255,255,255,.6);margin:0 0 16px}
  .pag-pos-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px}
  .pag-pos-slot{border:2px dashed rgba(255,255,255,.2);border-radius:14px;padding:12px;text-align:center;min-height:120px;display:flex;flex-direction:column;align-items:center;gap:8px;background:rgba(255,255,255,.06)}
  .pag-pos-slot.filled{border-color:#7c3aed;background:#fff}
  .pag-pos-slot-label{font-weight:800;color:#c4b5fd;font-size:12px;text-transform:uppercase;letter-spacing:.05em}
  .pag-pos-slot img{max-width:100%;max-height:70px;object-fit:contain}
  .pag-pos-slot-empty{color:rgba(255,255,255,.3);font-size:12px}
  .pag-pos-imgs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:14px}
  .pag-pos-img{cursor:pointer;border-radius:10px;border:2px solid transparent;background:#fff;padding:8px;text-align:center;transition:.2s ease}
  .pag-pos-img:hover{border-color:rgba(124,58,237,.5)}
  .pag-pos-img.is-left{border-color:#7c3aed;background:#fff}
  .pag-pos-img.is-right{border-color:#06b6d4;background:#fff}
  .pag-pos-img.is-both{border-color:#a855f7;background:#fff;box-shadow:0 0 0 3px rgba(168,85,247,.3)}
  .pag-pos-img img{max-width:100%;max-height:60px;object-fit:contain;display:block;margin:0 auto}
  .pag-pos-tag{font-size:11px;font-weight:700;margin-top:4px;padding:2px 7px;border-radius:999px;display:inline-block}
  .pag-pos-tag.left{background:#7c3aed;color:#fff}
  .pag-pos-tag.right{background:#06b6d4;color:#fff}
  .pag-flip-row{display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap}
  .pag-flip-btn{padding:9px 16px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:rgba(255,255,255,.8);font-size:14px;font-weight:700;cursor:pointer;transition:.2s ease;flex:1;text-align:center}
  .pag-flip-btn:hover{border-color:rgba(124,58,237,.6);color:#fff;background:rgba(124,58,237,.1)}
  .pag-flip-btn:disabled{opacity:.35;cursor:not-allowed}
  .pag-flip-btns-row{display:flex;gap:10px;width:100%}
  .pag-flip-separator{font-size:12px;color:rgba(255,255,255,.4);text-align:center;padding:4px 0;letter-spacing:.05em;text-transform:uppercase;width:100%}
  .pag-swap-inline-btn{width:100%;padding:11px 16px;border-radius:12px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.07);color:#fff;font-size:14px;font-weight:800;cursor:pointer;transition:.2s ease;margin-bottom:4px}
  .pag-swap-inline-btn:hover:not(:disabled){border-color:#7c3aed;background:rgba(124,58,237,.12);color:#ddd6fe}
  .pag-swap-inline-btn:disabled{opacity:.3;cursor:not-allowed}
  .pag-pos-explain{font-size:13px;color:rgba(255,255,255,.6);line-height:1.5;padding:10px 12px;background:rgba(255,255,255,.04);border-radius:10px;margin-bottom:10px;width:100%;box-sizing:border-box}
  .pag-pos-explain strong{color:rgba(255,255,255,.85)}
  .pag-same-side-msg{background:rgba(124,58,237,.12);border:1px solid rgba(124,58,237,.4);border-radius:10px;padding:10px 14px;color:#c4b5fd;font-size:13px;font-weight:700;text-align:center;margin-bottom:12px}
  .pag-inline-choice{margin-top:14px}
  .pag-inline-choice p{margin:0 0 10px;color:#fff;font-weight:700}
  .pag-textarea-hint{color:rgba(255,255,255,.6);font-size:14px;margin:0 0 12px}
  .pag-textarea-hint kbd{background:rgba(255,255,255,.12);border-radius:6px;padding:2px 7px;font-family:monospace;font-size:13px;color:#fff}
  .pag-textarea{width:100%;border-radius:14px;border:1px solid rgba(255,255,255,.14);background:#fff;color:#000;padding:14px 16px;font-size:17px;font-family:inherit;line-height:1.6;resize:none;box-sizing:border-box;min-height:120px}
  .pag-textarea-count{text-align:right;color:rgba(255,255,255,.5);font-size:13px;margin-top:6px}
  .pag-front-preview{position:relative;width:100%;aspect-ratio:12/3;overflow:hidden}
  .pag-front-bg{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;display:block}
  .pag-front-logo{position:absolute;top:50%;transform:translateY(-50%);width:20%;height:76%;object-fit:contain;display:block}
  .pag-front-logo.left{left:0}.pag-front-logo.right{right:0}
  .pag-preview-card p{margin:10px 0 0;color:#fff;font-weight:700;text-align:center}
  .pag-canvas-wrap{position:sticky;top:0;z-index:50;width:100%;margin:0 0 18px;overflow:hidden;background:#1a1a1a;box-shadow:0 4px 24px rgba(0,0,0,.4)}
  .pag-preview-canvas{display:block;width:100%;height:auto}
  .pag-canvas-loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#ddd6fe;font-weight:700;font-size:14px;background:rgba(0,0,0,.6)}
  .pag-canvas-loading.hidden{display:none}
  .pag-customize-panel{display:flex;flex-direction:column;gap:18px;margin-top:0}
  .pag-customize-row{display:flex;flex-direction:column;gap:8px}
  .pag-font-select{width:100%;margin:0;color:#000;background:#fff;font-size:15px;border-radius:12px;padding:13px 16px;border:1px solid rgba(255,255,255,.14);box-sizing:border-box}
  .pag-align-group{display:flex;gap:8px}
  .pag-align-btn{padding:7px 14px;border-radius:8px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:rgba(255,255,255,.7);font-size:13px;font-weight:600;cursor:pointer;transition:.15s ease}
  .pag-align-btn.is-selected{border-color:#7c3aed;background:rgba(124,58,237,.18);color:#fff;box-shadow:0 0 0 2px rgba(124,58,237,.2)}
  .pag-size-row{display:flex;align-items:center;gap:14px}
  .pag-size-slider{flex:1;-webkit-appearance:none;appearance:none;height:8px;border-radius:999px;background:rgba(255,255,255,.15);outline:none;cursor:pointer}
  .pag-size-slider::-webkit-slider-thumb{-webkit-appearance:none;width:26px;height:26px;border-radius:50%;background:#7c3aed;cursor:pointer;box-shadow:0 0 0 4px rgba(124,58,237,.25)}
  .pag-size-slider::-moz-range-thumb{width:26px;height:26px;border-radius:50%;background:#7c3aed;cursor:pointer;border:none}
  .pag-size-value{min-width:48px;text-align:right;font-weight:800;color:#ddd6fe;font-size:14px;flex-shrink:0}
  .pag-summary-details{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:18px;margin-top:16px}
  .pag-summary-details p{margin:0 0 12px;color:#fff}
  .pag-price{font-size:22px;font-weight:800;color:#ddd6fe}
  .pag-thickness-surcharge{margin-top:-8px;margin-bottom:12px;padding:10px 14px;border-radius:10px;background:rgba(124,58,237,.1);border:1px solid rgba(124,58,237,.3);color:#c4b5fd;font-weight:800;font-size:15px}
  .pag-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:18px}
  .pag-btn{appearance:none;border:0;border-radius:14px;padding:14px 20px;font-weight:800;font-size:15px;cursor:pointer;transition:.2s ease}
  .pag-btn-primary{background:var(--pag-violet);color:#fff}
  .pag-btn-primary:hover{background:var(--pag-violet-dark);transform:translateY(-1px)}
  .pag-btn-secondary{background:rgba(255,255,255,.08);color:#fff}
  .pag-btn-glow{box-shadow:0 0 0 4px rgba(124,58,237,.18),0 10px 22px rgba(124,58,237,.24)}
  /* Galerie configurateur */
  /* Galerie step-2c style gallery.liquid */
  .pag-gal2-toolbar{display:grid;gap:12px;margin-bottom:16px}
  .pag-gal2-search-wrap{max-width:100%}
  .pag-gal2-special-filters{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
  .pag-gal2-special-btn{border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05);color:rgba(255,255,255,.8);border-radius:999px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer;transition:.2s ease}
  .pag-gal2-special-btn:hover{border-color:rgba(124,58,237,.6);background:rgba(124,58,237,.1);color:#fff}
  .pag-gal2-special-btn.is-active{background:#7c3aed;color:#fff;border-color:#7c3aed;box-shadow:0 4px 14px rgba(124,58,237,.3)}
  .pag-gal2-count-bar{text-align:center;font-size:13px;font-weight:800;color:#a78bfa}
  .pag-gal2-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:16px}
  .pag-gal2-card{position:relative;border-radius:12px;overflow:hidden;background:#f8f8f8;border:2px solid transparent;cursor:pointer;transition:transform .2s ease,border-color .2s ease,box-shadow .2s ease}
  .pag-gal2-card:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,.15);border-color:rgba(124,58,237,.3)}
  .pag-gal2-card.is-selected{border-color:#7c3aed;box-shadow:0 0 0 3px rgba(124,58,237,.25)}
  .pag-gal2-card-media{aspect-ratio:1/1;overflow:hidden;position:relative}
  .pag-gal2-card-media img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .3s ease}
  .pag-gal2-card:hover .pag-gal2-card-media img{transform:scale(1.05)}
  .pag-gal2-card-overlay{position:absolute;inset:0;background:linear-gradient(to top,rgba(17,24,39,.85),transparent 50%);opacity:0;transition:opacity .2s ease;display:flex;flex-direction:column;justify-content:flex-end;padding:10px;pointer-events:none}
  .pag-gal2-card:hover .pag-gal2-card-overlay,.pag-gal2-card.is-selected .pag-gal2-card-overlay{opacity:1}
  .pag-gal2-card-prompt{font-size:11px;color:#fff;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-bottom:6px}
  .pag-gal2-add-btn{appearance:none;border:0;background:#7c3aed;color:#fff;border-radius:8px;padding:6px 8px;font-size:10px;font-weight:800;cursor:pointer;width:100%;pointer-events:auto}
  .pag-gal2-add-btn.is-added{background:#5b21b6}
  .pag-gal2-badge{position:absolute;top:6px;right:6px;background:#7c3aed;color:#fff;font-size:10px;font-weight:800;border-radius:999px;padding:3px 7px;z-index:3}
  .pag-gal2-sticky-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;background:rgba(0,0,0,.85);backdrop-filter:blur(10px);border:1px solid rgba(124,58,237,.3);border-radius:16px;padding:12px 16px;position:sticky;top:10px;z-index:50;box-shadow:0 8px 24px rgba(0,0,0,.4)}
  #galleryStepCount{font-size:14px;font-weight:800;color:#a78bfa}
  @media(max-width:600px){.pag-gal2-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(min-width:990px){.pag-gal2-grid{grid-template-columns:repeat(5,minmax(0,1fr))}}

  .pag-gal-search-wrap{margin:0 0 12px}
  .pag-gal-search{width:100%;padding:11px 16px;border-radius:999px;border:1px solid rgba(124,58,237,.3);background:rgba(255,255,255,.06);color:#fff;font-size:14px;outline:none;box-sizing:border-box;transition:.2s ease}
  .pag-gal-search::placeholder{color:rgba(255,255,255,.35)}
  .pag-gal-search:focus{border-color:#7c3aed;background:rgba(124,58,237,.08);box-shadow:0 0 0 3px rgba(124,58,237,.12)}
  .pag-gal-cats{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}
  .pag-gal-cat{border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05);color:rgba(255,255,255,.75);border-radius:999px;padding:6px 14px;font-size:12px;font-weight:700;cursor:pointer;transition:.15s ease}
  .pag-gal-cat:hover{border-color:rgba(124,58,237,.6);color:#fff}
  .pag-gal-cat.is-active{background:#7c3aed;color:#fff;border-color:#7c3aed}

  .pag-gal-search{width:100%;padding:10px 16px;border-radius:999px;border:1px solid rgba(124,58,237,.3);background:rgba(255,255,255,.06);color:#fff;font-size:14px;outline:none;box-sizing:border-box;transition:.2s ease;margin-bottom:12px;display:block}
  .pag-gal-search::placeholder{color:rgba(255,255,255,.35)}
  .pag-gal-search:focus{border-color:#7c3aed;background:rgba(124,58,237,.08)}
  .pag-gal-cats{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
  .pag-gal-cat{border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05);color:rgba(255,255,255,.75);border-radius:999px;padding:6px 14px;font-size:12px;font-weight:700;cursor:pointer;transition:.15s ease}
  .pag-gal-cat:hover{border-color:rgba(124,58,237,.6);color:#fff}
  .pag-gal-cat.is-active{background:#7c3aed;color:#fff;border-color:#7c3aed}
  @media(max-width:640px){
    .pag-choice-grid.two,.pag-config-grid,.pag-logo-grid,.pag-preview-grid,.pag-pos-imgs{grid-template-columns:1fr 1fr}
    .pag-pos-grid{grid-template-columns:1fr 1fr}
  }
</style>

<script type="text/javascript">
// Neutralise le scroll automatique du thème Shopify vers le formulaire produit
if (history.scrollRestoration) history.scrollRestoration = "manual";
(function() {
  var navType = performance.getEntriesByType("navigation");
  var isBackForward = navType.length && navType[0].type === "back_forward";
  if (isBackForward) return; // Ne pas toucher au scroll si retour arrière

  // Bloque tout scroll pendant 1.5s après le chargement
  var scrollLocked = true;
  var savedX = 0, savedY = 0;
  function lockScroll() {
    if (scrollLocked) window.scrollTo(savedX, savedY);
  }
  window.addEventListener("scroll", lockScroll, { passive: true });
  window.scrollTo(0, 0);

  // Déverrouille après que le thème ait fini son scroll automatique
  setTimeout(function() {
    scrollLocked = false;
    window.removeEventListener("scroll", lockScroll);
  }, 1500);
})();

document.addEventListener("DOMContentLoaded", function() {
  var API_BASE = "https://simulateur-pag.up.railway.app";
  var SINGLE_GEN_LIMIT = 2, DOUBLE_GEN_LIMIT = 1, MAX_LINES = 4;
  var CANVAS_W = 760, CANVAS_H = 190, PROD_W = 2362, PROD_H = 590;
  var COLOR_LABELS = {"acier-brosse":"Acier brossé","or":"Or","cuivre":"Cuivre","blanc":"Blanc","noir":"Noir","noir-brillant":"Noir brillant","gris":"Gris","noyer":"Noyer","rose":"Rose"};
  var COLOR_IMAGES = {"acier-brosse":"https://cdn.shopify.com/s/files/1/0267/9436/1022/files/acier-fd.png","or":"https://cdn.shopify.com/s/files/1/0267/9436/1022/files/or-fd.png","cuivre":"https://cdn.shopify.com/s/files/1/0267/9436/1022/files/cuivre-fd.png","blanc":"https://cdn.shopify.com/s/files/1/0267/9436/1022/files/blanc-fd.png","noir":"https://cdn.shopify.com/s/files/1/0267/9436/1022/files/noir-fd.png","noir-brillant":"https://cdn.shopify.com/s/files/1/0267/9436/1022/files/noirm-fd.png","gris":"https://cdn.shopify.com/s/files/1/0267/9436/1022/files/gris-fd.png","noyer":"https://cdn.shopify.com/s/files/1/0267/9436/1022/files/noyer-fd.png","rose":"https://cdn.shopify.com/s/files/1/0267/9436/1022/files/rose-fd.png"};
  var WHITE_ELEMENTS = ["noir","noir-brillant","gris","noyer","rose"];
  var ALLOWED_THICKNESS = {"acier-brosse":["1.6","3.2"],"or":["1.6","3.2"],"cuivre":["1.6","3.2"],"blanc":["1.6","3.2"],"noir":["1.6","3.2"],"noir-brillant":["1.6","3.2"],"gris":["1.6"],"noyer":["1.6"],"rose":["1.6"]};
  var DIMENSIONS = ["100x25mm","150x37mm","200x50mm","250x87mm","300x100mm"];
  var FONT_NAMES = [], loadedFonts = {}, fontsApiLoaded = false;

  function fetchFontList(cb) {
    if (fontsApiLoaded) { cb(); return; }
    fetch(API_BASE + "/api/fonts").then(function(r){return r.json();}).then(function(d){FONT_NAMES=(d&&d.fonts)||[];fontsApiLoaded=true;cb();}).catch(function(){fontsApiLoaded=true;cb();});
  }
  function loadOneFont(name, cb) {
    if (!name||loadedFonts[name]) {cb();return;}
    try {
      var face = new FontFace(name,"url("+API_BASE+"/fonts/"+encodeURIComponent(name)+".ttf)");
      face.load().then(function(l){document.fonts.add(l);loadedFonts[name]=true;cb();}).catch(function(){cb();});
    } catch(e) {cb();}
  }
  function loadAllFonts(cb) {
    fetchFontList(function(){
      var rem=FONT_NAMES.length; if(!rem){cb();return;}
      FONT_NAMES.forEach(function(n){loadOneFont(n,function(){rem--;if(rem===0)cb();});});
    });
  }

  var state = {
    wantsAiLogo:null, logoCount:1, imageSource:null, generatingSecond:false,
    gallerySelectedUrls:[], logoOptions1:[], logoOptions2:[],
    logoPrompt1:"", logoPrompt2:"", leftLogoUrl:null, rightLogoUrl:null,
    flippedLeft:false, flippedRight:false, lines:[], selectedColor:null,
    selectedVariantId:null, fontFamily:"", fontSize:null, textAlign:"center",
    generationUsage:{single:0,double:0},
    logoCache:{singlePrompt:"",leftPrompt:"",rightPrompt:"",singleResults:[],leftResults:[],rightResults:[]},
    productionUrl:""
  };

  var allSteps = [1,2,"2b","2c",3,4,5,6,7,8,9,10];
  function gel(id){return document.getElementById(id);}

  function showStep(n) {
    allSteps.forEach(function(num){
      var el=gel("step-"+num);
      if(el){if(num===n)el.classList.add("is-active");else el.classList.remove("is-active");}
    });
    var bar=gel("globalProgressBar");
    var idx=allSteps.indexOf(n);
    if(bar&&idx!==-1) bar.style.width=((idx/(allSteps.length-1))*100)+"%";
    var s=gel("step-"+n);
    if(s) setTimeout(function(){s.scrollIntoView({behavior:"smooth",block:"start"});},50);
  }

  function setSelBtn(sel,btn){document.querySelectorAll(sel).forEach(function(b){b.classList.remove("is-selected");});btn.classList.add("is-selected");}
  function setSelCard(btn){document.querySelectorAll(".pag-config-card").forEach(function(b){b.classList.remove("is-selected");});btn.classList.add("is-selected");}
  function showErr(id,msg){var el=gel(id);if(el){el.textContent=msg;el.style.display="block";}}
  function hideErr(id){var el=gel(id);if(el){el.style.display="none";el.textContent="";}}

  var FUN_STEPS = [
    {icon:"☕", msg:"Profitez-en pour boire un café…", sub:"Notre IA se met au travail !"},
    {icon:"🧠", msg:"Notre IA réfléchit intensément…", sub:"C'est plus compliqué que ça en a l'air"},
    {icon:"🎨", msg:"On dessine votre idée pixel par pixel…", sub:"L'art prend du temps !"},
    {icon:"🔥", msg:"Ça chauffe dans les serveurs…", sub:"Votre création est en cours"},
    {icon:"🤯", msg:"Votre idée nous a bien challengés !", sub:"On ne lâche rien !"},
    {icon:"⚡", msg:"Presque là… encore quelques secondes", sub:"La magie opère"},
    {icon:"🌟", msg:"Les dernières touches…", sub:"On peaufine votre création"},
    {icon:"🚀", msg:"Décollage imminent !", sub:"Votre plaque prend forme"},
    {icon:"🎉", msg:"Et voilà, c'est prêt !", sub:"Votre création vous attend !"}
  ];

  function startLoader(fId,mId,pId,msgs,done) {
    var p=0,mi=0,funIdx=0;
    var fill=gel(fId),msg=gel(mId),pct=gel(pId);
    var funOverlay=gel("pagFunOverlay"),funBar=gel("pagFunBar"),funPct=gel("pagFunPct"),funIcon=gel("pagFunIcon"),funMsg=gel("pagFunMsg");

    // Init barre principale
    if(msg)msg.textContent=msgs[0]||"";
    if(fill)fill.style.width="0%";
    if(pct)pct.textContent="0%";

    // Ouvre le popup fun
    if(funOverlay){funOverlay.classList.add("is-open");}
    if(funBar)funBar.style.width="0%";
    if(funPct)funPct.textContent="0%";
    if(funIcon)funIcon.textContent=FUN_STEPS[0].icon;
    if(funMsg)funMsg.textContent=FUN_STEPS[0].msg;
    var funSubEl=gel("pagFunSub");if(funSubEl)funSubEl.textContent=FUN_STEPS[0].sub||"";

    var cp=[12,32,55,78,96];

    // Rotation des messages fun toutes les 3.5s
    var funTimer=setInterval(function(){
      funIdx=(funIdx+1)%FUN_STEPS.length;
      if(funIcon)funIcon.textContent=FUN_STEPS[funIdx].icon;
      if(funMsg)funMsg.textContent=FUN_STEPS[funIdx].msg;
      var funSub=gel("pagFunSub");if(funSub)funSub.textContent=FUN_STEPS[funIdx].sub||"";
    },3500);

    var iv=setInterval(function(){
      p+=Math.random()*5+2; if(p>96)p=96;
      var pStr=Math.round(p)+"%";
      // Barre principale — forcer reflow pour déclencher la transition CSS
      if(fill){
        fill.style.transition="none";
        fill.getBoundingClientRect(); // reflow
        fill.style.transition="width .4s cubic-bezier(0.4,0,0.2,1)";
        fill.style.width=p+"%";
      }
      if(pct)pct.textContent=pStr;
      // Barre popup fun — même reflow forcé
      if(funBar){
        funBar.style.transition="none";
        funBar.getBoundingClientRect();
        funBar.style.transition="width .4s cubic-bezier(0.4,0,0.2,1)";
        funBar.style.width=p+"%";
      }
      if(funPct)funPct.textContent=pStr;
      // Messages barre principale
      var m2=0;while(m2<cp.length-1&&p>=cp[m2+1])m2++;
      if(m2>mi){mi=m2;if(msg)msg.textContent=msgs[mi]||msgs[msgs.length-1];}
    },220);

    return function(){
      clearInterval(iv);
      clearInterval(funTimer);
      // Finit à 100%
      if(fill)fill.style.width="100%";
      if(pct)pct.textContent="100%";
      if(funBar)funBar.style.width="100%";
      if(funPct)funPct.textContent="100%";
      if(funIcon)funIcon.textContent="🎉";
      if(funMsg)funMsg.textContent="Voilà ! C'est prêt !";
      var funSubFinal=gel("pagFunSub");if(funSubFinal)funSubFinal.textContent="Votre création vous attend !";
      if(msg&&msgs.length)msg.textContent=msgs[msgs.length-1];
      setTimeout(function(){
        if(funOverlay)funOverlay.classList.remove("is-open");
        if(done)done();
      },800);
    };
  }

  function postJson(url,payload,cb) {
    fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)})
    .then(function(res){return res.text().then(function(text){
      var data=null;try{data=JSON.parse(text);}catch(e){}
      if(!res.ok){var err=new Error((data&&data.error)||"HTTP "+res.status);err.status=res.status;err.code=data&&data.code;cb(err,null);}
      else cb(null,data);
    });}).catch(function(e){cb(e,null);});
  }

  function updateGenWarning() {
    var el=gel("logoGenerationWarning");if(!el)return;
    if(state.logoCount===2){var r=Math.max(0,DOUBLE_GEN_LIMIT-state.generationUsage.double);el.innerHTML="<strong>Info</strong> — 2 images : <strong>1 génération max</strong>.<div class=\"pag-logo-warning-count\">Restante : "+r+"/"+DOUBLE_GEN_LIMIT+"</div>";}
    else{var r2=Math.max(0,SINGLE_GEN_LIMIT-state.generationUsage.single);el.innerHTML="<strong>Info</strong> — 1 image : <strong>2 générations max</strong>.<div class=\"pag-logo-warning-count\">Restantes : "+r2+"/"+SINGLE_GEN_LIMIT+"</div>";}
  }
  function parseLines(text){return text.split("\n").map(function(l){return l.trim();}).filter(function(l){return l.length>0;}).slice(0,MAX_LINES);}

  function loadImg(url,cb){
    if(!url){cb(null);return;}
    var img=new Image();img.crossOrigin="anonymous";
    img.onload=function(){cb(img);};
    img.onerror=function(){cb(null);};
    // Cache-busting pour éviter que les logos disparaissent au redimensionnement
    img.src=url+(url.indexOf("?")>=0?"&_r=":"?_r=")+Math.random();
  }

  function calcAutoFontSize(lines,W,H,hasLeft,hasRight){
    if(!lines.length)return Math.round(H*0.25);
    var lc=lines.length,len=1;
    lines.forEach(function(l){if(l.length>len)len=l.length;});
    var base;
    if(lc===1)      base=(hasLeft&&hasRight)?H*0.42:(hasLeft||hasRight)?H*0.48:H*0.55;
    else if(lc===2) base=(hasLeft&&hasRight)?H*0.26:(hasLeft||hasRight)?H*0.30:H*0.36;
    else if(lc===3) base=(hasLeft&&hasRight)?H*0.19:(hasLeft||hasRight)?H*0.22:H*0.26;
    else            base=(hasLeft&&hasRight)?H*0.15:(hasLeft||hasRight)?H*0.17:H*0.20;
    var ratio = len > 10 ? 10/len : 1;
    return Math.max(Math.round(base*ratio),Math.round(H*0.05));
  }

  function colorizeLogoCanvas(srcImg,zoneW,logoH,isWhite,isProd){
    var tmp=document.createElement("canvas");tmp.width=zoneW;tmp.height=logoH;
    var tc=tmp.getContext("2d");

    // Préserve le ratio d'aspect — plus d'étirement
    var srcW=srcImg.naturalWidth||srcImg.width||zoneW;
    var srcH=srcImg.naturalHeight||srcImg.height||logoH;
    var ratio=srcW/srcH;
    var maxW=zoneW*0.88;
    var maxH=logoH*0.88;
    var drawW,drawH;
    if(ratio>maxW/maxH){drawW=maxW;drawH=maxW/ratio;}
    else{drawH=maxH;drawW=maxH*ratio;}
    var drawX=Math.round((zoneW-drawW)/2);
    var drawY=Math.round((logoH-drawH)/2);
    tc.drawImage(srcImg,drawX,drawY,Math.round(drawW),Math.round(drawH));

    var d=tc.getImageData(0,0,zoneW,logoH);
    var t=isProd?[17,17,17]:(isWhite?[255,255,255]:[17,17,17]);
    for(var i=0;i<d.data.length;i+=4){if(d.data[i+3]>30){d.data[i]=t[0];d.data[i+1]=t[1];d.data[i+2]=t[2];}}
    tc.putImageData(d,0,0);return tmp;
  }

  function drawPlaque(canvasEl,W,H,color,isProd,cb){
    var ctx=canvasEl.getContext("2d");ctx.clearRect(0,0,W,H);
    var isWhite=WHITE_ELEMENTS.indexOf(color)!==-1,textColor=isWhite?"#ffffff":"#111111";
    var hasLeft=!!state.leftLogoUrl,hasRight=!!state.rightLogoUrl;
    var logoZoneW=Math.round(W*0.20),textLeft=0,textWidth=W;
    if(hasLeft&&!hasRight){textLeft=logoZoneW;textWidth=W-logoZoneW;}
    if(!hasLeft&&hasRight){textLeft=0;textWidth=W-logoZoneW;}
    if(hasLeft&&hasRight){textLeft=logoZoneW;textWidth=W-logoZoneW*2;}

    function drawText(){
      var lines=state.lines.filter(function(l){return l.trim().length>0;});if(!lines.length){cb();return;}
      var fs=(state.fontSize!==null&&state.fontSize!==undefined)?Math.round(state.fontSize*(H/CANVAS_H)):calcAutoFontSize(lines,W,H,hasLeft,hasRight);
      var fontName=state.fontFamily||(FONT_NAMES.length?FONT_NAMES[0]:"Arial");
      var lineGap=Math.round(fs*1.28),totalH=lineGap*lines.length,startY=Math.round((H-totalH)/2+fs*0.82);
      var align=state.textAlign||"center";
      ctx.fillStyle=isProd?"#111111":textColor;ctx.textAlign=align;ctx.textBaseline="alphabetic";
      ctx.font="bold "+fs+"px \""+fontName+"\", Arial, sans-serif";
      var cx;
      if(align==="left")cx=textLeft+Math.round(textWidth*0.05);
      else if(align==="right")cx=textLeft+textWidth-Math.round(textWidth*0.05);
      else cx=textLeft+Math.round(textWidth/2);
      lines.forEach(function(line,i){ctx.fillText(line,cx,startY+i*lineGap);});cb();
    }

    function drawLogoOnCanvas(img,x,logoH,flipped){
      var tmp=colorizeLogoCanvas(img,logoZoneW,logoH,isWhite,isProd);
      if(flipped){
        var flip=document.createElement("canvas");flip.width=logoZoneW;flip.height=logoH;
        var fc=flip.getContext("2d");fc.translate(logoZoneW,0);fc.scale(-1,1);fc.drawImage(tmp,0,0);
        ctx.drawImage(flip,x,Math.round((H-logoH)/2));
      } else {ctx.drawImage(tmp,x,Math.round((H-logoH)/2));}
    }

    function drawLogos(){
      var logoH=Math.round(H*0.97);
      var pending=(hasLeft?1:0)+(hasRight?1:0);
      if(pending===0){drawText();return;}
      function done(){pending--;if(pending===0)drawText();}
      if(hasLeft){loadImg(state.leftLogoUrl,function(img){if(img)drawLogoOnCanvas(img,0,logoH,state.flippedLeft);done();});}
      if(hasRight){loadImg(state.rightLogoUrl,function(img){if(img)drawLogoOnCanvas(img,W-logoZoneW,logoH,state.flippedRight);done();});}
    }

    if(isProd){ctx.fillStyle="#ffffff";ctx.fillRect(0,0,W,H);drawLogos();}
    else{loadImg(COLOR_IMAGES[color],function(bg){if(bg)ctx.drawImage(bg,0,0,W,H);else{ctx.fillStyle="#ccc";ctx.fillRect(0,0,W,H);}drawLogos();});}
  }

  function renderPreviewCanvas(){
    var c=gel("previewCanvas");if(!c||!state.selectedColor)return;
    c.width=CANVAS_W;c.height=CANVAS_H;
    var cl=gel("canvasLoading");if(cl)cl.classList.remove("hidden");
    drawPlaque(c,CANVAS_W,CANVAS_H,state.selectedColor,false,function(){if(cl)cl.classList.add("hidden");});
  }
  function renderSummaryCanvas(){
    var c=gel("summaryCanvas");if(!c||!state.selectedColor)return;
    c.width=CANVAS_W;c.height=CANVAS_H;
    drawPlaque(c,CANVAS_W,CANVAS_H,state.selectedColor,false,function(){});
  }
  function generateProductionFile(cb){
    var canvas=document.createElement("canvas");canvas.width=PROD_W;canvas.height=PROD_H;
    drawPlaque(canvas,PROD_W,PROD_H,state.selectedColor,true,function(){
      var b64=canvas.toDataURL("image/png");
      var dS=gel("dimensionSelect"),tS=gel("thicknessSelect");
      postJson(API_BASE+"/api/render/production-from-image",{imageBase64:b64,color:state.selectedColor||"blanc",dimension:dS?dS.value:"100x25mm",thickness:tS?tS.value:"1.6",line1:state.lines[0]||"",line2:state.lines[1]||"",line3:state.lines[2]||"",flippedLeft:state.flippedLeft||false,flippedRight:state.flippedRight||false},function(err,data){if(!err&&data)state.productionUrl=data.url||"";cb();});
    });
  }

  // ── Galerie configurateur avec catégories + recherche ────────────────────
  var galAllItems = [];
  var galActiveCategory = "tous";
  var galSearchQuery = "";
  var galSearchTimer = null;

  function prettyGalCat(cat) {
    var map = {tous:"Tous",animaux:"Animaux",sport:"Sport",medical:"Médical",beaute:"Beauté",restauration:"Restauration",batiment:"Bâtiment",nature:"Nature",symboles:"Symboles",divers:"Divers"};
    return map[cat] || cat;
  }

  function renderGalCategories(categories) {
    var el = gel("galCategories"); if (!el) return;
    var cats = ["tous"].concat((categories||[]).filter(function(c){return c!=="tous";}));
    el.innerHTML = cats.map(function(cat){
      return "<button type=\"button\" class=\"pag-gal-cat"+(cat===galActiveCategory?" is-active":"")+"\" data-cat=\""+cat+"\">"+prettyGalCat(cat)+"</button>";
    }).join("");
    el.querySelectorAll(".pag-gal-cat").forEach(function(btn){
      btn.addEventListener("click",function(){
        galActiveCategory = btn.getAttribute("data-cat");
        el.querySelectorAll(".pag-gal-cat").forEach(function(b){b.classList.remove("is-active");});
        btn.classList.add("is-active");
        applyGalFilters();
      });
    });
  }

  var galSpecialFilter = "all";

  function applyGalFilters() {
    var grid=gel("galleryGrid"), empty=gel("galleryEmpty"); if(!grid)return;
    var filtered = galAllItems.slice();

    if (galActiveCategory !== "tous") {
      filtered = filtered.filter(function(i){return (i.category||"divers")===galActiveCategory;});
    }
    if (galSearchQuery.trim()) {
      var q = galSearchQuery.trim().toLowerCase();
      filtered = filtered.filter(function(i){
        return (i.prompt||"").toLowerCase().indexOf(q)!==-1 || (i.category||"").toLowerCase().indexOf(q)!==-1;
      });
    }
    if (galSpecialFilter === "top_rated") {
      filtered.sort(function(a,b){return (b.avg_rating||0)-(a.avg_rating||0);});
    } else if (galSpecialFilter === "most_used") {
      filtered.sort(function(a,b){return (b.use_count||0)-(a.use_count||0);});
    }

    grid.innerHTML = "";
    if (!filtered.length) { if(empty)empty.style.display="block"; return; }
    if (empty) empty.style.display = "none";

    var maxSel = state.logoCount;
    filtered.forEach(function(item){
      var url = item.image_url||item.imageUrl||item.shopifyUrl||item.preview||""; if(!url)return;
      var prompt = item.prompt||"";
      var selected = state.gallerySelectedUrls.indexOf(url)!==-1;

      var card = document.createElement("div");
      card.className = "pag-gal2-card"+(selected?" is-selected":"");
      card.setAttribute("data-url",url);
      card.innerHTML =
        (selected?"<div class='pag-gal2-badge'>✓</div>":"")
        +"<div class='pag-gal2-card-media'><img src='"+url+"' alt='"+prompt.replace(/'/g,"")+"' loading='lazy'>"
        +"<div class='pag-gal2-card-overlay'>"
        +(prompt?"<div class='pag-gal2-card-prompt'>"+prompt+"</div>":"")
        +"<button type='button' class='pag-gal2-add-btn"+(selected?" is-added":"")+"'>"+(selected?"✓ Sélectionnée":"+ Sélectionner")+"</button>"
        +"</div></div>";

      card.addEventListener("click",function(){toggleGalleryCard(card,url);});
      grid.appendChild(card);
    });
  }

  function loadGallery(onDone){
    var loading=gel("galleryLoading"),empty=gel("galleryEmpty"),grid=gel("galleryGrid");
    if(!grid)return;
    if(loading)loading.style.display="block";
    grid.innerHTML=""; state.gallerySelectedUrls=[];
    galActiveCategory="tous"; galSearchQuery="";
    var se=gel("galSearch"); if(se)se.value="";
    updateGalleryUI();
    fetch(API_BASE+"/api/gallery").then(function(r){return r.json();}).then(function(d){
      if(loading)loading.style.display="none";
      galAllItems=(d&&d.items)||[];
      renderGalCategories(d&&d.categories);
      applyGalFilters();
      if(onDone)onDone();
    }).catch(function(){
      if(loading)loading.style.display="none";
      if(empty){empty.textContent="Erreur de chargement.";empty.style.display="block";}
    });
  }

  // Recherche debounce — dans DOMContentLoaded existant
  var galSearchInit=gel("galSearch");
  if(galSearchInit){galSearchInit.addEventListener("input",function(){
    clearTimeout(galSearchTimer);
    galSearchTimer=setTimeout(function(){galSearchQuery=galSearchInit.value;applyGalFilters();},250);
  });}

  function toggleGalleryCard(card,url){
    var maxSel=6;
    var idx=state.gallerySelectedUrls.indexOf(url);
    if(idx!==-1){
      state.gallerySelectedUrls.splice(idx,1);
      card.classList.remove("is-selected");
      // Mettre à jour le badge et le bouton
      var badge=card.querySelector(".pag-gal2-badge");if(badge)badge.remove();
      var btn=card.querySelector(".pag-gal2-add-btn");if(btn){btn.textContent="+ Sélectionner";btn.classList.remove("is-added");}
    } else if(state.gallerySelectedUrls.length<maxSel){
      state.gallerySelectedUrls.push(url);
      card.classList.add("is-selected");
      var badge2=document.createElement("div");badge2.className="pag-gal2-badge";badge2.textContent="✓";card.insertBefore(badge2,card.firstChild);
      var btn2=card.querySelector(".pag-gal2-add-btn");if(btn2){btn2.textContent="✓ Sélectionnée";btn2.classList.add("is-added");}
    }
    updateGalleryUI();
  }

  function updateGalleryUI(){
    var n=state.gallerySelectedUrls.length;
    var vBtn=gel("validateGalleryBtn"),sc=gel("gallerySecondChoice"),hint=gel("galleryStepHint");
    var countEl=gel("galleryStepCount");
    if(vBtn)vBtn.disabled=(n===0);
    if(sc)sc.style.display="none"; // plus nécessaire avec sélection libre
    if(hint)hint.textContent="Sélectionnez jusqu\'à 6 images — "+n+"/6 sélectionnée"+(n>1?"s":".")+".";
    if(countEl)countEl.textContent=n+" / 6 images sélectionnées";
    // Sync bouton sticky
    var vBtnTop=gel("validateGalleryBtnTop");
    if(vBtnTop)vBtnTop.disabled=(n===0);
  }

  // Filtres spéciaux galerie
  function setGalSpecialFilter(val, btn) {
    galSpecialFilter = val;
    document.querySelectorAll(".pag-gal2-special-btn").forEach(function(b){b.classList.remove("is-active");});
    if(btn)btn.classList.add("is-active");
    applyGalFilters();
  }
  var galFAll=gel("galFilterAll"),galFTop=gel("galFilterTopRated"),galFUsed=gel("galFilterMostUsed");
  if(galFAll)galFAll.addEventListener("click",function(){setGalSpecialFilter("all",galFAll);});
  if(galFTop)galFTop.addEventListener("click",function(){setGalSpecialFilter("top_rated",galFTop);});
  if(galFUsed)galFUsed.addEventListener("click",function(){setGalSpecialFilter("most_used",galFUsed);});

  function applyGalleryAndGoStep4(){
    var urls=state.gallerySelectedUrls;
    if(!urls.length)return;
    // Stocke toutes les URLs sélectionnées dans logoOptions1
    state.logoOptions1 = urls.map(function(u){return {url:u};});
    state.logoOptions2 = [];
    // Par défaut: 1ère image à gauche, 2ème à droite si disponible
    state.leftLogoUrl  = urls[0]||null;
    state.rightLogoUrl = urls[1]||null;
    // Met à jour logoCount selon le nb sélectionné
    state.logoCount = urls.length>=2?2:1;
    state.generatingSecond=false;
    renderStep4();showStep(4);
  }

  // ── renderStep4 ───────────────────────────────────────────────────────────
  function renderStep4(){
    var container=gel("step4Content");if(!container)return;container.innerHTML="";
    var allLogos=[];
    state.logoOptions1.forEach(function(l){allLogos.push(l);});
    state.logoOptions2.forEach(function(l){var f=false;allLogos.forEach(function(e){if(e.url===l.url)f=true;});if(!f)allLogos.push(l);});

    if(state.logoCount===1){
      gel("step4Title").textContent="Sélectionnez et positionnez votre image";
      var grid=document.createElement("div");grid.className="pag-logo-grid";
      var selUrl=state.leftLogoUrl||state.rightLogoUrl||"";
      allLogos.forEach(function(logo,i){
        var card=document.createElement("div");card.className="pag-logo-card"+(logo.url===selUrl?" is-selected":"");
        card.innerHTML="<div class=\"pag-logo-thumb\"><img src=\""+logo.url+"\" alt=\"Image "+(i+1)+"\"></div>";
        card.addEventListener("click",function(){
          container.querySelectorAll(".pag-logo-card").forEach(function(c){c.classList.remove("is-selected");});
          card.classList.add("is-selected");
          if(state.rightLogoUrl&&!state.leftLogoUrl)state.rightLogoUrl=logo.url;
          else{state.leftLogoUrl=logo.url;state.rightLogoUrl=null;}
          updatePosButtons();
        });grid.appendChild(card);
      });
      container.appendChild(grid);
      var posDiv=document.createElement("div");posDiv.className="pag-inline-choice";
      posDiv.innerHTML="<p>Position&nbsp;?</p><div class=\"pag-choice-grid two compact\"><button type=\"button\" class=\"pag-choice-btn pos-btn\" data-pos=\"left\">◀ À gauche</button><button type=\"button\" class=\"pag-choice-btn pos-btn\" data-pos=\"right\">À droite ▶</button></div>";
      container.appendChild(posDiv);
      var flipRow=document.createElement("div");flipRow.className="pag-flip-row";flipRow.style.marginTop="12px";
      flipRow.innerHTML="<button type=\"button\" class=\"pag-flip-btn\" id=\"flipSingleBtn\">↔ Retourner l'image</button>";
      container.appendChild(flipRow);
      var fsBtn=gel("flipSingleBtn");
      if(fsBtn){fsBtn.addEventListener("click",function(){
        if(state.leftLogoUrl)state.flippedLeft=!state.flippedLeft;else if(state.rightLogoUrl)state.flippedRight=!state.flippedRight;
        var isA=state.flippedLeft||state.flippedRight;
        fsBtn.style.cssText=isA?"border-color:#7c3aed;color:#c4b5fd;background:rgba(124,58,237,.15);":"";
        fsBtn.textContent=isA?"↔ Retourner l'image ✓":"↔ Retourner l'image";
        renderPreviewCanvas();
      });}
      function updatePosButtons(){
        container.querySelectorAll(".pos-btn").forEach(function(b){b.classList.remove("is-selected");});
        if(state.leftLogoUrl&&!state.rightLogoUrl){var lb=container.querySelector("[data-pos='left']");if(lb)lb.classList.add("is-selected");}
        else if(state.rightLogoUrl&&!state.leftLogoUrl){var rb=container.querySelector("[data-pos='right']");if(rb)rb.classList.add("is-selected");}
      }
      updatePosButtons();
      container.querySelectorAll(".pos-btn").forEach(function(btn){
        btn.addEventListener("click",function(){
          var sc2=container.querySelector(".pag-logo-card.is-selected"),url="";
          if(sc2){var img=sc2.querySelector("img");if(img)url=img.src;}
          else if(state.leftLogoUrl||state.rightLogoUrl)url=state.leftLogoUrl||state.rightLogoUrl;
          if(btn.dataset.pos==="left"){state.leftLogoUrl=url||null;state.rightLogoUrl=null;}
          else{state.rightLogoUrl=url||null;state.leftLogoUrl=null;}
          setSelBtn(".pos-btn",btn);
        });
      });
    } else {
      gel("step4Title").textContent="Sélectionnez et positionnez vos images";
      var slotsDiv=document.createElement("div");slotsDiv.className="pag-pos-grid";
      slotsDiv.innerHTML=
        "<div class=\"pag-pos-slot"+(state.leftLogoUrl?" filled":"")+"\" id=\"slotLeft\"><div class=\"pag-pos-slot-label\">◀ Gauche</div>"+(state.leftLogoUrl?"<img src=\""+state.leftLogoUrl+"\" alt=\"\">":"<div class=\"pag-pos-slot-empty\">1er clic</div>")+"</div>"+
        "<div class=\"pag-pos-slot"+(state.rightLogoUrl?" filled":"")+"\" id=\"slotRight\"><div class=\"pag-pos-slot-label\">Droite ▶</div>"+(state.rightLogoUrl?"<img src=\""+state.rightLogoUrl+"\" alt=\"\">":"<div class=\"pag-pos-slot-empty\">2ème clic</div>")+"</div>";
      container.appendChild(slotsDiv);
      var flipRowDiv=document.createElement("div");flipRowDiv.id="flipButtonsRow";flipRowDiv.className="pag-flip-row";
      container.appendChild(flipRowDiv);
      var imgGrid=document.createElement("div");imgGrid.className="pag-pos-imgs";

      function updateSlots(){
        var sl=gel("slotLeft"),sr=gel("slotRight");
        if(sl){var lS=state.flippedLeft?"transform:scaleX(-1);":"";sl.innerHTML="<div class=\"pag-pos-slot-label\">◀ Gauche</div>"+(state.leftLogoUrl?"<img src=\""+state.leftLogoUrl+"\" alt=\"\" style=\""+lS+"\">":"<div class=\"pag-pos-slot-empty\">1er clic</div>");if(state.leftLogoUrl)sl.classList.add("filled");else sl.classList.remove("filled");}
        if(sr){var rS=state.flippedRight?"transform:scaleX(-1);":"";sr.innerHTML="<div class=\"pag-pos-slot-label\">Droite ▶</div>"+(state.rightLogoUrl?"<img src=\""+state.rightLogoUrl+"\" alt=\"\" style=\""+rS+"\">":"<div class=\"pag-pos-slot-empty\">2ème clic</div>");if(state.rightLogoUrl)sr.classList.add("filled");else sr.classList.remove("filled");}
        var fRow=gel("flipButtonsRow");
        if(fRow){
          var lA=state.flippedLeft?"border-color:#7c3aed;color:#c4b5fd;background:rgba(124,58,237,.15);":"";
          var rA=state.flippedRight?"border-color:#7c3aed;color:#c4b5fd;background:rgba(124,58,237,.15);":"";
          var lD=!state.leftLogoUrl?"disabled":"",rD=!state.rightLogoUrl?"disabled":"";
          var bF=state.leftLogoUrl&&state.rightLogoUrl;
          fRow.innerHTML=
            "<div class=\"pag-pos-explain\"><strong>💡</strong> 1er clic = gauche, 2ème clic = droite. Utilisez <em>Inverser</em> pour échanger.</div>"+
            "<button type=\"button\" class=\"pag-swap-inline-btn\" id=\"swapInlineBtn\" "+(!bF?"disabled":"")+">⇄ Inverser gauche / droite</button>"+
            "<div class=\"pag-flip-separator\">Retourner une image</div>"+
            "<div class=\"pag-flip-btns-row\">"+
              "<button type=\"button\" class=\"pag-flip-btn\" id=\"flipLeftBtn\" "+lD+" style=\""+lA+"\">"+(state.flippedLeft?"↔ Gauche ✓":"↔ Retourner gauche")+"</button>"+
              "<button type=\"button\" class=\"pag-flip-btn\" id=\"flipRightBtn\" "+rD+" style=\""+rA+"\">"+(state.flippedRight?"↔ Droite ✓":"↔ Retourner droite")+"</button>"+
            "</div>";
          var si=gel("swapInlineBtn");
          if(si)si.addEventListener("click",function(){var tmp=state.leftLogoUrl;state.leftLogoUrl=state.rightLogoUrl;state.rightLogoUrl=tmp;var tmpF=state.flippedLeft;state.flippedLeft=state.flippedRight;state.flippedRight=tmpF;updateSlots();renderPreviewCanvas();});
          var fb1=gel("flipLeftBtn"),fb2=gel("flipRightBtn");
          if(fb1)fb1.addEventListener("click",function(){state.flippedLeft=!state.flippedLeft;updateSlots();renderPreviewCanvas();});
          if(fb2)fb2.addEventListener("click",function(){state.flippedRight=!state.flippedRight;updateSlots();renderPreviewCanvas();});
        }
        imgGrid.querySelectorAll(".pag-pos-img").forEach(function(c){
          var u=c.getAttribute("data-url");c.classList.remove("is-left","is-right","is-both");
          var tag=c.querySelector(".pag-pos-tag");if(tag){tag.innerHTML="";tag.className="pag-pos-tag";}
          var iL=(u===state.leftLogoUrl),iR=(u===state.rightLogoUrl);
          if(iL&&iR){c.classList.add("is-both");if(tag)tag.innerHTML="<span class=\"pag-pos-tag left\">G</span>&nbsp;<span class=\"pag-pos-tag right\">D</span>";}
          else if(iL){c.classList.add("is-left");if(tag){tag.textContent="Gauche";tag.classList.add("left");}}
          else if(iR){c.classList.add("is-right");if(tag){tag.textContent="Droite";tag.classList.add("right");}}
        });
        var sameMsg=gel("sameSideMsg");
        if(sameMsg)sameMsg.style.display=(state.leftLogoUrl&&state.leftLogoUrl===state.rightLogoUrl)?"block":"none";
      }

      allLogos.forEach(function(logo){
        var card=document.createElement("div");card.className="pag-pos-img";
        if(logo.url===state.leftLogoUrl)card.classList.add("is-left");
        if(logo.url===state.rightLogoUrl)card.classList.add("is-right");
        card.setAttribute("data-url",logo.url);
        card.innerHTML="<img src=\""+logo.url+"\" alt=\"\"><div class=\"pag-pos-tag\"></div>";
        card.addEventListener("click",function(){
          if(!state.leftLogoUrl)state.leftLogoUrl=logo.url;
          else if(!state.rightLogoUrl)state.rightLogoUrl=logo.url;
          else state.leftLogoUrl=logo.url;
          updateSlots();
        });imgGrid.appendChild(card);
      });
      container.appendChild(imgGrid);
      var sameMsg=document.createElement("div");sameMsg.id="sameSideMsg";sameMsg.className="pag-same-side-msg";sameMsg.style.display="none";
      sameMsg.textContent="✓ La même image sera placée des deux côtés de votre texte.";container.appendChild(sameMsg);
      updateSlots();
    }
  }

  function populateFontSelect(){
    var sel=gel("fontSelect");if(!sel)return;sel.innerHTML="";
    FONT_NAMES.forEach(function(name){var opt=document.createElement("option");opt.value=name;opt.textContent=name;if(name===state.fontFamily)opt.selected=true;sel.appendChild(opt);});
  }
  // Prix fixes par dimension (1.6mm) — indépendant de productData
  var FIXED_PRICES = {
    "100x25mm":  {"1.6": 16.90, "3.2": 18.90},
    "150x37mm":  {"1.6": 18.90, "3.2": 20.90},
    "200x50mm":  {"1.6": 20.90, "3.2": 22.90},
    "250x87mm":  {"1.6": 22.90, "3.2": 24.90},
    "300x100mm": {"1.6": 24.90, "3.2": 26.90}
  };
  // Couleurs disponibles en 3.2mm
  var ALLOWED_THICKNESS_32 = ["acier-brosse","or","cuivre","blanc","noir","noir-brillant"];

  function getPriceForDim(dim){
    var thick = (function(){var s=gel("thicknessSelect");return s?s.value:"1.6";})();
    var key = dim.toLowerCase().replace("mm","").replace("x","x");
    // Cherche la clé correspondante
    var price = null;
    Object.keys(FIXED_PRICES).forEach(function(k){
      if(k.toLowerCase()===dim.toLowerCase())price=FIXED_PRICES[k][thick]||FIXED_PRICES[k]["1.6"];
    });
    return price ? price.toFixed(2)+" €" : null;
  }
  function updateDimensionSelect(){
    var sel=gel("dimensionSelect");if(!sel)return;
    var cur=sel.value||DIMENSIONS[0];sel.innerHTML="";
    DIMENSIONS.forEach(function(dim){var opt=document.createElement("option");opt.value=dim;var p=getPriceForDim(dim);opt.textContent=p?dim+" — "+p:dim;if(dim===cur)opt.selected=true;sel.appendChild(opt);});
  }
  function updateThicknessOptions(){
    var sel=gel("thicknessSelect");if(!sel)return;
    var allowed=ALLOWED_THICKNESS[state.selectedColor]||["1.6"];
    var dS=gel("dimensionSelect");
    var dimKey=dS?dS.value:"100x25mm";
    var prices=FIXED_PRICES[dimKey]||{};
    var bp=prices["1.6"]||null, tp=prices["3.2"]||null;
    sel.querySelectorAll("option").forEach(function(o){
      o.style.display=allowed.indexOf(o.value)!==-1?"":"none";
      if(o.value==="1.6")o.textContent="1,6 mm"+(bp?" — "+bp.toFixed(2)+" €":"");
      if(o.value==="3.2"&&allowed.indexOf("3.2")!==-1){
        var diff=tp&&bp?tp-bp:null;
        o.textContent=diff&&diff>0?"3,2 mm (+"+diff.toFixed(2)+" €)":"3,2 mm";
      }
    });
    if(allowed.indexOf(sel.value)===-1)sel.value=allowed[0];
  }
  function updateThicknessSurcharge(){
    var el=gel("thicknessSurcharge");if(!el)return;
    var sel=gel("thicknessSelect");if(!sel||sel.value!=="3.2"){el.style.display="none";return;}
    var dS=gel("dimensionSelect");
    var dimKey=dS?dS.value:"100x25mm";
    var prices=FIXED_PRICES[dimKey]||{};
    var bp=prices["1.6"],tp=prices["3.2"];
    if(bp&&tp){var diff=tp-bp;if(diff>0){el.textContent="Supplément épaisseur 3,2 mm : +"+diff.toFixed(2)+" €";el.style.display="block";return;}}
    el.style.display="none";
  }
  function refreshVariant(cb){
    var dS=gel("dimensionSelect"),tS=gel("thicknessSelect");
    var dim=dS?dS.value:"100x25mm",thick=tS?tS.value:"1.6";
    postJson(API_BASE+"/api/variant/resolve",{dimension:dim,thickness:thick,color:state.selectedColor},function(err,data){
      if(err||!data){if(cb)cb();return;}
      state.selectedVariantId=data.variantId;
      if(window.productData&&window.productData.handle){
        fetch("/products/"+window.productData.handle+".json").then(function(r){return r.json();}).then(function(pr){
          var prV=pr&&pr.product&&pr.product.variants,v=null;
          if(prV)prV.forEach(function(pv){if(String(pv.id)===String(data.variantId))v=pv;});
          if(v){var fp=gel("finalPrice");if(fp)fp.textContent=parseFloat(v.price).toFixed(2)+" €";}
          if(cb)cb();
        }).catch(function(){
          // Affiche le prix depuis la table fixe
          var dS2=gel("dimensionSelect"),tS2=gel("thicknessSelect");
          var dimKey2=dS2?dS2.value:"100x25mm";
          var thick2=tS2?tS2.value:"1.6";
          var prices2=FIXED_PRICES[dimKey2]||{};
          var finalP=prices2[thick2]||prices2["1.6"]||null;
          var fp=gel("finalPrice");if(fp&&finalP)fp.textContent=finalP.toFixed(2)+" €";
          if(cb)cb();
        });
      } else {if(cb)cb();}
    });
  }

  function buildMiniHTML(colorKey){
    var bg=COLOR_IMAGES[colorKey],lf=WHITE_ELEMENTS.indexOf(colorKey)!==-1?"brightness(0) invert(1)":"none";
    var html="<img class=\"pag-front-bg\" src=\""+bg+"\" alt=\"\">";
    if(state.leftLogoUrl)html+="<img class=\"pag-front-logo left\" src=\""+state.leftLogoUrl+"\" alt=\"\" style=\"filter:"+lf+";\">";
    if(state.rightLogoUrl)html+="<img class=\"pag-front-logo right\" src=\""+state.rightLogoUrl+"\" alt=\"\" style=\"filter:"+lf+";\">";
    return html;
  }
  function renderPreviewChoices(){
    var grid=gel("previewGrid");if(!grid)return;grid.innerHTML="";
    Object.keys(COLOR_IMAGES).forEach(function(colorKey){
      var card=document.createElement("div");card.className="pag-preview-card";
      card.innerHTML="<div class=\"pag-front-preview\">"+buildMiniHTML(colorKey)+"</div><p>"+(COLOR_LABELS[colorKey]||colorKey)+"</p>";
      card.addEventListener("click",function(){
        document.querySelectorAll("#previewGrid .pag-preview-card").forEach(function(e){e.classList.remove("is-selected");});
        card.classList.add("is-selected");state.selectedColor=colorKey;state.fontSize=null;
        updateThicknessOptions();updateDimensionSelect();refreshVariant(function(){});
        var cl=gel("canvasLoading");if(cl)cl.classList.remove("hidden");
        loadAllFonts(function(){
          populateFontSelect();if(!state.fontFamily){state.fontFamily=FONT_NAMES.indexOf('Baskvill')!==-1?'Baskvill':FONT_NAMES[0]||'Arial';}
          var aFs=calcAutoFontSize(state.lines.filter(function(l){return l.trim();}),CANVAS_W,CANVAS_H,!!state.leftLogoUrl,!!state.rightLogoUrl);
          state.fontSize=aFs;var sl=gel("fontSizeSlider"),sv=gel("fontSizeValue");if(sl)sl.value=aFs;if(sv)sv.textContent=aFs+"px";
          var t7=gel("textInputStep7");if(t7)t7.value=state.lines.join("\n");
          var lc7=gel("lineCountStep7");if(lc7)lc7.textContent=state.lines.filter(function(l){return l.trim();}).length;
          var swR=gel("swapLogosRow");if(swR)swR.style.display=(state.leftLogoUrl&&state.rightLogoUrl)?"block":"none";
          updateFlipStep7Buttons();renderPreviewCanvas();
          setTimeout(function(){showStep(7);},250);
        });
      });grid.appendChild(card);
    });
  }
  function updateSummary(){
    var sc=gel("summaryColor"),sd=gel("summaryDimension"),st=gel("summaryThickness"),sx=gel("summaryText"),sf=gel("summaryFont");
    var dS=gel("dimensionSelect"),tS=gel("thicknessSelect");
    if(sc)sc.textContent=COLOR_LABELS[state.selectedColor]||"--";
    if(sd)sd.textContent=dS?dS.value:"--";
    if(st)st.textContent=(tS?tS.value:"--")+" mm";
    if(sx)sx.textContent=state.lines.filter(function(l){return l.trim();}).join(" / ")||"--";
    if(sf)sf.textContent=state.fontFamily||"--";
  }
  function initFromRealized(){
    var raw = localStorage.getItem("pagRealizedIdea");
    if (!raw) return false;
    var data;
    try { data = JSON.parse(raw); } catch(e) { return false; }
    if (!data) return false;
    localStorage.removeItem("pagRealizedIdea");

    var leftUrl  = data.leftLogoUrl  || null;
    var rightUrl = data.rightLogoUrl || null;

    // Si pas de logos stockés — on ne peut pas recréer la plaque
    if (!leftUrl && !rightUrl) return false;

    state.wantsAiLogo  = "yes";
    state.flippedLeft  = false;
    state.flippedRight = false;

    if (leftUrl && rightUrl) {
      // 2 logos
      state.logoCount    = 2;
      state.leftLogoUrl  = leftUrl;
      state.rightLogoUrl = rightUrl;
      state.logoOptions1 = [{ url: leftUrl }];
      state.logoOptions2 = [{ url: rightUrl }];
    } else {
      // 1 logo
      state.logoCount    = 1;
      state.leftLogoUrl  = leftUrl || rightUrl;
      state.rightLogoUrl = null;
      state.logoOptions1 = [{ url: state.leftLogoUrl }];
      state.logoOptions2 = [];
    }

    // Va directement à l'étape 5 (texte) puis couleur
    renderPreviewChoices();
    showStep(5);
    // Scroll vers le configurateur après un court délai
    setTimeout(function(){
      var section = document.getElementById("plaque-ai-configurator");
      if(section){
        var top = section.getBoundingClientRect().top + window.pageYOffset - 20;
        window.scrollTo({top: top, behavior: "smooth"});
      }
    }, 400);
    return true;
  }

  function initFromGallery(){
    var raw=localStorage.getItem("pagProjectSelection");if(!raw)return false;
    var images;try{images=JSON.parse(raw);}catch(e){return false;}
    if(!Array.isArray(images)||!images.length)return false;
    localStorage.removeItem("pagProjectSelection");
    state.wantsAiLogo="yes";state.logoCount=images.length>=2?2:1;
    state.logoOptions1=images.map(function(item){return{url:item.imageUrl||item.image_url||item.url||""};}).filter(function(i){return i.url;});
    state.logoOptions2=[];
    if(state.logoCount===1){state.leftLogoUrl=state.logoOptions1[0]?state.logoOptions1[0].url:null;state.rightLogoUrl=null;}
    else{state.leftLogoUrl=state.logoOptions1[0]?state.logoOptions1[0].url:null;state.rightLogoUrl=state.logoOptions1[1]?state.logoOptions1[1].url:null;}
    renderStep4();showStep(4);return true;
  }

  // ── ÉVÉNEMENTS ─────────────────────────────────────────────────────────────

  // Étape 1
  document.querySelectorAll("[data-logo-ai]").forEach(function(btn){
    btn.addEventListener("click",function(){
      setSelBtn("[data-logo-ai]",btn);state.wantsAiLogo=btn.getAttribute("data-logo-ai");
      if(state.wantsAiLogo==="no"){state.leftLogoUrl=null;state.rightLogoUrl=null;setTimeout(function(){showStep(5);},250);}
      else setTimeout(function(){showStep(2);},250);
    });
  });

  // Étape 2
  document.querySelectorAll("[data-logo-count]").forEach(function(btn){
    btn.addEventListener("click",function(){
      setSelCard(btn);state.logoCount=Number(btn.getAttribute("data-logo-count"));
      updateGenWarning();setTimeout(function(){showStep("2b");},250);
    });
  });

  // Étape 2b — source
  var srcGalleryBtn=gel("srcGalleryBtn");
  if(srcGalleryBtn)srcGalleryBtn.addEventListener("click",function(){
    state.imageSource="gallery";state.generatingSecond=false;state.gallerySelectedUrls=[];
    var title=gel("galleryStepTitle");
    if(title)title.textContent=state.logoCount===1?"Choisissez votre image":"Choisissez vos images";
    loadGallery(function(){});showStep("2c");
  });

  var srcAiBtn=gel("srcAiBtn");
  if(srcAiBtn)srcAiBtn.addEventListener("click",function(){
    state.imageSource="ai";state.generatingSecond=false;
    if(state.logoCount===1){gel("logoPromptSingle").style.display="block";gel("logoPromptDouble").style.display="none";gel("logoPromptTitle").textContent="Décrivez votre image";}
    else{gel("logoPromptSingle").style.display="none";gel("logoPromptDouble").style.display="block";gel("logoPromptTitle").textContent="Décrivez vos images";}
    updateGenWarning();showStep(3);
  });

  // Étape 2c — galerie
  var galleryBackBtn=gel("galleryBackBtn");
  if(galleryBackBtn)galleryBackBtn.addEventListener("click",function(){
    if(state.generatingSecond){state.generatingSecond=false;showStep("2c");}else showStep("2b");
  });

  var galleryBackBtnTop=gel("galleryBackBtnTop");
  if(galleryBackBtnTop)galleryBackBtnTop.addEventListener("click",function(){showStep("2b");});
  var validateGalleryBtnTop=gel("validateGalleryBtnTop");
  if(validateGalleryBtnTop)validateGalleryBtnTop.addEventListener("click",function(){applyGalleryAndGoStep4();});
  var validateGalleryBtn=gel("validateGalleryBtn");
  if(validateGalleryBtn)validateGalleryBtn.addEventListener("click",function(){
    if(!state.gallerySelectedUrls.length)return;
    applyGalleryAndGoStep4();
  });

  var galleryPickSecondBtn=gel("galleryPickSecondBtn");
  if(galleryPickSecondBtn)galleryPickSecondBtn.addEventListener("click",function(){
    state.leftLogoUrl=state.gallerySelectedUrls[0]||null;state.rightLogoUrl=null;
    state.generatingSecond=true;state.gallerySelectedUrls=[];
    var grid=gel("galleryGrid");if(grid)grid.querySelectorAll(".pag-logo-card").forEach(function(c){c.classList.remove("is-selected");});
    updateGalleryUI();
  });

  var galleryGenerateSecondBtn=gel("galleryGenerateSecondBtn");
  if(galleryGenerateSecondBtn)galleryGenerateSecondBtn.addEventListener("click",function(){
    state.leftLogoUrl=state.gallerySelectedUrls[0]||null;state.rightLogoUrl=null;
    state.generatingSecond=true;
    gel("logoPromptSingle").style.display="block";gel("logoPromptDouble").style.display="none";
    gel("logoPromptTitle").textContent="Générez votre 2ème image";
    updateGenWarning();showStep(3);
  });

  // Étape 3 — retour
  var backFromPromptBtn=gel("backFromPromptBtn");
  if(backFromPromptBtn)backFromPromptBtn.addEventListener("click",function(){
    if(state.generatingSecond)showStep("2c");else showStep("2b");
  });

  // Étape 4 — retour
  var backFromStep4Btn=gel("backFromStep4Btn");
  if(backFromStep4Btn)backFromStep4Btn.addEventListener("click",function(){
    if(state.imageSource==="gallery")showStep("2c");else showStep(3);
  });

  // Boutons retour génériques
  document.querySelectorAll("[data-prev]").forEach(function(btn){
    btn.addEventListener("click",function(){showStep(Number(btn.getAttribute("data-prev")));});
  });

  // Étape 5 — retour
  var backFromText=gel("backFromText");
  if(backFromText)backFromText.addEventListener("click",function(){
    if(state.wantsAiLogo==="yes")showStep(4);else showStep(1);
  });

  // Génération IA
  var generateBtn=gel("generateLogosBtn");
  if(generateBtn){generateBtn.addEventListener("click",function(){
    hideErr("logoErrorBox");
    function cleanVal(v){return v.split("\n").map(function(l){return l.trim();}).filter(Boolean).join(", ");}
    var p1=gel("logoPrompt1"),pl=gel("logoPromptLeft"),pr=gel("logoPromptRight");

    // En mode generatingSecond ou logoCount===1 : on génère 1 seule image
    var genOne=(state.generatingSecond||state.logoCount===1);

    if(genOne){
      state.logoPrompt1=p1?cleanVal(p1.value):"";
      if(!state.logoPrompt1){showErr("logoErrorBox","Merci de décrire votre image.");return;}
      var c1=(state.logoCache.singlePrompt===state.logoPrompt1&&state.logoCache.singleResults.length>0);
      if(!c1&&state.generationUsage.single>=SINGLE_GEN_LIMIT){showErr("logoErrorBox","Limite de générations atteinte.");return;}
    } else {
      state.logoPrompt1=pl?cleanVal(pl.value):"";state.logoPrompt2=pr?cleanVal(pr.value):"";
      if(!state.logoPrompt1||!state.logoPrompt2){showErr("logoErrorBox","Merci de décrire les deux images.");return;}
      var cL=(state.logoCache.leftPrompt===state.logoPrompt1&&state.logoCache.leftResults.length>0);
      var cR=(state.logoCache.rightPrompt===state.logoPrompt2&&state.logoCache.rightResults.length>0);
      if(!(cL&&cR)&&state.generationUsage.double>=DOUBLE_GEN_LIMIT){showErr("logoErrorBox","Limite de générations atteinte.");return;}
    }

    var lb=gel("logoLoadingBlock");if(lb)lb.style.display="block";
    var stop=startLoader("loadingFill","loadingMessage","loadingPercent",["Analyse…","Création…","Optimisation…","Préparation…","Finalisation…"],function(){if(lb)lb.style.display="none";});

    if(genOne){
      var cs1=(state.logoCache.singlePrompt===state.logoPrompt1&&state.logoCache.singleResults.length>0);
      function afterOne(){state.generatingSecond=false;stop();renderStep4();showStep(4);}
      if(cs1){state.logoOptions1=state.logoCache.singleResults.slice();afterOne();}
      else{postJson(API_BASE+"/api/logos/search-or-generate",{prompt:state.logoPrompt1,count:3},function(err,d){
        state.logoOptions1=(d&&d.logos)||[];state.generationUsage.single++;
        state.logoCache.singlePrompt=state.logoPrompt1;state.logoCache.singleResults=state.logoOptions1.slice();
        updateGenWarning();afterOne();
      });}
    } else {
      var cll=(state.logoCache.leftPrompt===state.logoPrompt1&&state.logoCache.leftResults.length>0);
      var crr=(state.logoCache.rightPrompt===state.logoPrompt2&&state.logoCache.rightResults.length>0);
      if(cll)state.logoOptions1=state.logoCache.leftResults.slice();
      if(crr)state.logoOptions2=state.logoCache.rightResults.slice();
      if(cll&&crr){stop();renderStep4();showStep(4);return;}
      var ua=false;
      function afterLeft(){
        if(!crr){postJson(API_BASE+"/api/logos/search-or-generate",{prompt:state.logoPrompt2,count:3},function(err,d2){
          state.logoOptions2=(d2&&d2.logos)||[];state.logoCache.rightPrompt=state.logoPrompt2;state.logoCache.rightResults=state.logoOptions2.slice();
          if(ua)state.generationUsage.double++;updateGenWarning();stop();renderStep4();showStep(4);
        });}
        else{if(ua)state.generationUsage.double++;updateGenWarning();stop();renderStep4();showStep(4);}
      }
      if(!cll){postJson(API_BASE+"/api/logos/search-or-generate",{prompt:state.logoPrompt1,count:3},function(err,d1){
        state.logoOptions1=(d1&&d1.logos)||[];state.logoCache.leftPrompt=state.logoPrompt1;state.logoCache.leftResults=state.logoOptions1.slice();
        ua=true;afterLeft();
      });}
      else afterLeft();
    }
  });}

  var validateLogosBtn=gel("validateLogosBtn");
  if(validateLogosBtn)validateLogosBtn.addEventListener("click",function(){
    if(state.logoCount===1&&!state.leftLogoUrl&&!state.rightLogoUrl){showErr("logoErrorBox2","Sélectionnez une image et choisissez sa position.");return;}
    if(state.logoCount===2&&(!state.leftLogoUrl||!state.rightLogoUrl)){showErr("logoErrorBox2","Placez une image à gauche et une à droite.");return;}
    hideErr("logoErrorBox2");showStep(5);
  });

  var textInput=gel("textInput"),lineCount=gel("lineCount");
  if(textInput){
    textInput.addEventListener("input",function(){
      var rows=textInput.value.split("\n");if(rows.length>MAX_LINES)textInput.value=rows.slice(0,MAX_LINES).join("\n");
      state.lines=parseLines(textInput.value);if(lineCount)lineCount.textContent=state.lines.length;
    });
    textInput.addEventListener("keydown",function(e){if(e.key==="Enter"&&textInput.value.split("\n").length>=MAX_LINES)e.preventDefault();});
  }
  var validateTextBtn=gel("validateTextBtn");
  if(validateTextBtn)validateTextBtn.addEventListener("click",function(){
    state.lines=parseLines(textInput?textInput.value:"");
    if(!state.lines.length){alert("Merci de saisir au moins une ligne de texte.");return;}
    renderPreviewChoices();showStep(6);
  });

  var textInputStep7=gel("textInputStep7"),lineCountStep7=gel("lineCountStep7");
  if(textInputStep7){
    textInputStep7.addEventListener("input",function(){
      var rows=textInputStep7.value.split("\n");if(rows.length>MAX_LINES)textInputStep7.value=rows.slice(0,MAX_LINES).join("\n");
      state.lines=parseLines(textInputStep7.value);if(lineCountStep7)lineCountStep7.textContent=state.lines.filter(function(l){return l.trim();}).length;
      renderPreviewCanvas();
    });
    textInputStep7.addEventListener("keydown",function(e){if(e.key==="Enter"&&textInputStep7.value.split("\n").length>=MAX_LINES)e.preventDefault();});
  }

  document.querySelectorAll(".pag-align-btn").forEach(function(btn){
    btn.addEventListener("click",function(){setSelBtn(".pag-align-btn",btn);state.textAlign=btn.getAttribute("data-align");renderPreviewCanvas();});
  });

  var swapBtn=gel("swapLogosBtn");
  if(swapBtn)swapBtn.addEventListener("click",function(){
    var tmp=state.leftLogoUrl;state.leftLogoUrl=state.rightLogoUrl;state.rightLogoUrl=tmp;
    var tmpF=state.flippedLeft;state.flippedLeft=state.flippedRight;state.flippedRight=tmpF;
    updateFlipStep7Buttons();renderPreviewCanvas();
  });

  function updateFlipStep7Buttons(){
    var fl=gel("flipLeftStep7"),fr=gel("flipRightStep7");
    if(fl){fl.textContent=state.flippedLeft?"↔ Gauche ✓":"↔ Retourner gauche";fl.style.cssText=state.flippedLeft?"border-color:#7c3aed;color:#c4b5fd;background:rgba(124,58,237,.15);":"";fl.style.display=state.leftLogoUrl?"":"none";}
    if(fr){fr.style.display=state.rightLogoUrl?"":"none";fr.textContent=state.flippedRight?"↔ Droite ✓":"↔ Retourner droite";fr.style.cssText=state.flippedRight?"border-color:#7c3aed;color:#c4b5fd;background:rgba(124,58,237,.15);":"";}
  }
  var fL7=gel("flipLeftStep7");if(fL7)fL7.addEventListener("click",function(){state.flippedLeft=!state.flippedLeft;updateFlipStep7Buttons();renderPreviewCanvas();});
  var fR7=gel("flipRightStep7");if(fR7)fR7.addEventListener("click",function(){state.flippedRight=!state.flippedRight;updateFlipStep7Buttons();renderPreviewCanvas();});

  var fontSel=gel("fontSelect");if(fontSel)fontSel.addEventListener("change",function(){state.fontFamily=fontSel.value;renderPreviewCanvas();});
  var fSlider=gel("fontSizeSlider");if(fSlider)fSlider.addEventListener("input",function(){var v=parseInt(fSlider.value,10);state.fontSize=v;var sv=gel("fontSizeValue");if(sv)sv.textContent=v+"px";renderPreviewCanvas();});

  var vcBtn=gel("validateCustomizeBtn");if(vcBtn)vcBtn.addEventListener("click",function(){showStep(8);});
  var vdBtn=gel("validateDimensionBtn");if(vdBtn)vdBtn.addEventListener("click",function(){refreshVariant(function(){updateThicknessOptions();updateThicknessSurcharge();showStep(9);});});
  var vtBtn=gel("validateThicknessBtn");if(vtBtn)vtBtn.addEventListener("click",function(){updateThicknessOptions();refreshVariant(function(){generateProductionFile(function(){updateSummary();renderSummaryCanvas();showStep(10);});});});

  var dSel=gel("dimensionSelect");if(dSel)dSel.addEventListener("change",function(){if(state.selectedColor)refreshVariant(function(){});});
  var tSel=gel("thicknessSelect");if(tSel)tSel.addEventListener("change",function(){if(state.selectedColor){updateThicknessOptions();refreshVariant(function(){});updateDimensionSelect();}updateThicknessSurcharge();});

  var cartBtn=gel("addToCartBtn");
  if(cartBtn)cartBtn.addEventListener("click",function(){
    if(!state.selectedVariantId)return;

    // Désactive le bouton pendant le traitement
    cartBtn.disabled = true;
    cartBtn.textContent = "Enregistrement…";

    var dS=gel("dimensionSelect"),tS=gel("thicknessSelect");
    var props={"_image":state.productionUrl||"","Aperçu plaque":state.productionUrl||"","Couleur plaque":state.selectedColor||"","Dimension":dS?dS.value:"","Epaisseur":tS?tS.value:"","Ligne 1":state.lines[0]||"","Ligne 2":state.lines[1]||"","Ligne 3":state.lines[2]||"","Ligne 4":state.lines[3]||"","Police":state.fontFamily||"","Alignement":state.textAlign||"center","Fichier production":state.productionUrl||""};

    function doAddToCart() {
      fetch("/cart/add.js",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({items:[{id:state.selectedVariantId,quantity:1,properties:props}]})})
      .then(function(res){if(res.ok)window.location.href="/cart";else{cartBtn.disabled=false;cartBtn.textContent="Ajouter au panier";res.text().then(function(t){console.error(t);});}})
      .catch(function(e){console.error(e);cartBtn.disabled=false;cartBtn.textContent="Ajouter au panier";});
    }

    // Sauvegarde la réalisation pour la galerie (non bloquant)
    // On envoie l'image de preview déjà sur le canvas step-7 (previewCanvas)
    var realizedSent = false;
    function sendRealizedAndCart() {
      if (realizedSent) return;
      realizedSent = true;
      try {
        var previewC = gel("previewCanvas");
        var imageBase64 = previewC ? previewC.toDataURL("image/png") : null;
        if (imageBase64) {
          // Upload l'image colorée sur Shopify pour la miniature panier
          postJson(API_BASE + "/api/render/production-from-image", {
            imageBase64:  imageBase64,
            color:        state.selectedColor || "blanc",
            dimension:    dS ? dS.value : "100x25mm",
            thickness:    tS ? tS.value : "1.6",
            line1:        state.lines[0] || "",
            line2:        state.lines[1] || "",
            line3:        state.lines[2] || "",
            flippedLeft:  state.flippedLeft  || false,
            flippedRight: state.flippedRight || false,
            keepColor:    true
          }, function(err, data) {
            if (!err && data && data.url) {
              props["_image"]            = data.url;
              props["Fichier production"] = data.url;
              props["_Aperçu plaque"]    = data.url;
            }
            // Envoie aussi en arrière-plan pour la galerie réalisations
            try {
              postJson(API_BASE + "/api/realized/save", {
                imageBase64:  imageBase64,
                color:        state.selectedColor || "",
                dimension:    dS ? dS.value : "",
                thickness:    tS ? tS.value : "",
                leftLogoUrl:  state.leftLogoUrl  || null,
                rightLogoUrl: state.rightLogoUrl || null
              }, function(){});
            } catch(e2) {}
            doAddToCart();
          });
        } else {
          doAddToCart();
        }
      } catch(e) {
        console.warn("Realized error:", e);
        doAddToCart();
      }
    }
    // Sécurité : si realized prend trop longtemps, on ajoute quand même au panier
    setTimeout(function() { if (!realizedSent) { realizedSent = true; doAddToCart(); } }, 5000);
    sendRealizedAndCart();
  });

  window.addEventListener("pag:openConfiguratorFromGallery",function(){initFromGallery();});
  window.addEventListener("pag:initFromRealized",function(){initFromRealized();});
  updateDimensionSelect();
  loadAllFonts(function(){});

  // Détecte ?step=ai pour aller directement à l'étape 2 (choix 1 ou 2 images) avec source IA
  function initFromUrlParam() {
    var params = new URLSearchParams(window.location.search);
    if (params.get("step") === "ai") {
      // Simule le clic sur "Avec image(s)" puis va à l'étape 2 (nb de logos)
      state.wantsAiLogo = "yes";
      state.imageSource = null; // laisse le client choisir 1 ou 2
      showStep(2);
      return true;
    }
    return false;
  }

  if(initFromRealized()){}
  else if(initFromUrlParam()){}
  else if(!initFromGallery())showStep(1);
});

  // Injecte la miniature plaque dans le cart drawer ET la page panier
  function pagInjectCartPreview() {
    fetch('/cart.js')
      .then(function(r){ return r.json(); })
      .then(function(cart) {
        cart.items.forEach(function(item, itemIdx) {
          var imgUrl = item.properties && (item.properties['Fichier production'] || item.properties['_image']);
          if (!imgUrl) return;

          // Cible toutes les lignes possibles (drawer + page panier)
          var selectors = [
            '#CartDrawer-Item-' + (itemIdx + 1),
            '[id*="CartItem-' + (itemIdx + 1) + '"]',
            '.cart-item:nth-child(' + (itemIdx + 1) + ')',
            'tr.cart-item:nth-child(' + (itemIdx + 1) + ')'
          ];

          selectors.forEach(function(sel) {
            var row = document.querySelector(sel);
            if (!row) return;
            if (row.querySelector('.pag-cart-injected')) return;

            // Remplace l'image produit existante par la miniature plaque
            var existingImg = row.querySelector('.cart-item__image, .cart-item__media img');
            if (existingImg) {
              existingImg.src = imgUrl;
              existingImg.style.objectFit = 'contain';
              existingImg.style.background = '#fff';
              existingImg.classList.add('pag-cart-injected');
            } else {
              // Fallback : injection sous le titre
              var nameEl = row.querySelector('.cart-item__name, .cart-item__title, h3, h4');
              if (!nameEl) return;
              var div = document.createElement('div');
              div.className = 'pag-cart-injected';
              div.style.cssText = 'margin:6px 0';
              var img = document.createElement('img');
              img.src = imgUrl;
              img.alt = 'Votre plaque';
              img.style.cssText = 'width:100%;max-width:200px;height:auto;border-radius:4px;display:block;background:#fff;object-fit:contain;';
              div.appendChild(img);
              nameEl.parentNode.insertBefore(div, nameEl.nextSibling);
            }
          });
        });
      })
      .catch(function(){});
  }

  document.addEventListener('DOMContentLoaded', function() {
    // Injection immédiate sur page panier
    pagInjectCartPreview();

    // Ré-injection quand le drawer s'ouvre ou se met à jour
    var observer = new MutationObserver(function() { pagInjectCartPreview(); });
    var targets = [
      document.getElementById('CartDrawer'),
      document.querySelector('.cart-drawer'),
      document.querySelector('#cart-items'),
      document.querySelector('.cart-items')
    ];
    targets.forEach(function(t) {
      if (t) observer.observe(t, { childList: true, subtree: true });
    });

    document.addEventListener('cart:updated', pagInjectCartPreview);
    document.addEventListener('cart-drawer:open', pagInjectCartPreview);
    document.addEventListener('cart-drawer:after-open', pagInjectCartPreview);
  });
</script>

{% schema %}
{
  "name": "Plaque AI Configurator",
  "settings": [],
  "presets": [{ "name": "Plaque AI Configurator" }]
}
{% endschema %}
