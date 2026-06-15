// ─────────────────────────────────────────────────────────────────
//  MODULE COMPRESS — compression canvas des images avant stockage
//  Règle : toute image doit tenir en 50 Mo maximum.
//  Compression progressive : qualité puis dimensions réduites.
// ─────────────────────────────────────────────────────────────────

var Compress = (function () {

  var MAX_BYTES = 50 * 1024 * 1024; // 50 Mo

  // ── API publique ─────────────────────────────────────────────────
  // compress.image(file, options?) → Promise<{dataUrl, sizeKb}>
  // options.maxBytes : limite en octets (défaut 50 Mo)
  // options.maxDim   : dimension max (largeur ou hauteur) avant compression (défaut 1920)
  function image(file, options) {
    options = options || {};
    var maxBytes = options.maxBytes || MAX_BYTES;
    var maxDim   = options.maxDim   || 1920;

    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) {
        reject(new Error("Ce fichier n'est pas une image valide."));
        return;
      }

      var reader = new FileReader();
      reader.onerror = function () {
        reject(new Error("Impossible de lire le fichier."));
      };
      reader.onload = function (ev) {
        var img = new Image();
        img.onerror = function () {
          reject(new Error("Image invalide ou corrompue."));
        };
        img.onload = function () {
          _compressLoop(img, maxBytes, maxDim, resolve, reject);
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // ── Boucle de compression progressive ───────────────────────────
  function _compressLoop(img, maxBytes, maxDim, resolve, reject) {
    var origW = img.width;
    var origH = img.height;

    // Réduction initiale si l'image dépasse maxDim
    var baseScale = Math.min(maxDim / origW, maxDim / origH, 1);
    var baseW = Math.max(1, Math.round(origW * baseScale));
    var baseH = Math.max(1, Math.round(origH * baseScale));

    // Grille de tentatives : dimension × qualité (du plus qualitatif au plus compressé)
    var dimScales  = [1.0, 0.85, 0.70, 0.55, 0.40];
    var qualities  = [0.92, 0.85, 0.75, 0.65, 0.55, 0.45, 0.35];

    var attempts = [];
    dimScales.forEach(function (ds) {
      qualities.forEach(function (q) {
        attempts.push({
          w: Math.max(1, Math.round(baseW * ds)),
          h: Math.max(1, Math.round(baseH * ds)),
          q: q
        });
      });
    });

    function tryNext(i) {
      if (i >= attempts.length) {
        reject(new Error(
          "Impossible de compresser cette image sous 50 Mo.\n" +
          "Merci de choisir une image plus petite."
        ));
        return;
      }
      var a = attempts[i];
      var cv = document.createElement('canvas');
      cv.width  = a.w;
      cv.height = a.h;
      try {
        cv.getContext('2d').drawImage(img, 0, 0, a.w, a.h);
        var dataUrl = cv.toDataURL('image/jpeg', a.q);
        // Estimation de la taille binaire depuis la longueur base64
        var b64part = dataUrl.indexOf(',') > -1 ? dataUrl.split(',')[1] : dataUrl;
        var approxBytes = Math.round(b64part.length * 3 / 4);
        if (approxBytes <= maxBytes) {
          resolve({ dataUrl: dataUrl, sizeKb: Math.round(approxBytes / 1024) });
        } else {
          tryNext(i + 1);
        }
      } catch (err) {
        reject(new Error("Erreur lors du traitement de l'image."));
      }
    }

    tryNext(0);
  }

  return { image: image };

})();
