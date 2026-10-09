/* ==========================================================================
   Vault3D · Landing (uma dobra)
   1. Visualizador 3D com um "projeto" de várias peças STL na mesma mesa
   2. Faixa de funcionalidades que alterna sozinha e destaca peças no 3D
   3. Link de download pela release mais recente + banner do link de login
   ========================================================================== */
(function () {
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var COLORS = { cyan: '#22d3ee', white: '#e8eef4', yellow: '#fbbf24', grey: '#8796a6', orange: '#fb923c' };

  // ---------- Material com linhas de camada ----------
  function layerMaterial(THREE, color, layers) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uLayers: { value: layers },
        uGlow: { value: 0 },
        uDim: { value: 1 },
        uLight: { value: new THREE.Vector3(0.45, 0.85, 0.55).normalize() }
      },
      vertexShader: [
        'varying vec3 vN; varying vec3 vP; varying vec3 vV;',
        'void main(){',
        '  vec4 wp = modelMatrix * vec4(position,1.0);',
        '  vP = position;',
        '  vN = normalize(mat3(modelMatrix) * normal);',
        '  vV = normalize(cameraPosition - wp.xyz);',
        '  gl_Position = projectionMatrix * viewMatrix * wp;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uColor; uniform float uLayers; uniform vec3 uLight; uniform float uGlow; uniform float uDim;',
        'varying vec3 vN; varying vec3 vP; varying vec3 vV;',
        'void main(){',
        '  vec3 n = normalize(vN);',
        '  float diff = max(dot(n, uLight), 0.0);',
        '  float back = max(dot(n, -uLight), 0.0) * 0.25;',
        '  float rim = pow(1.0 - max(dot(n, normalize(vV)), 0.0), 2.5);',
        '  float l = fract(vP.y * uLayers);',
        '  float groove = smoothstep(0.0, 0.35, l) * smoothstep(1.0, 0.65, l);',
        '  vec3 c = uColor * (0.28 + 0.78 * diff + back);',
        '  c *= mix(0.78, 1.0, groove);',
        '  c += mix(vec3(0.35, 0.85, 1.0), vec3(1.0, 0.75, 0.2), uGlow) * rim * (0.5 + uGlow);',
        '  gl_FragColor = vec4(c * uDim, 1.0);',
        '}'
      ].join('\n')
    });
  }

  // ---------- Geometrias ----------
  function twistedVase(THREE) {
    var pts = [];
    for (var i = 0; i <= 90; i++) {
      var t = i / 90;
      var r = 0.55 + 0.32 * Math.sin(t * Math.PI * 1.15 + 0.2) + 0.08 * Math.sin(t * Math.PI * 4);
      pts.push(new THREE.Vector2(Math.max(r, 0.2), t * 2.4));
    }
    var g = new THREE.LatheGeometry(pts, 7).toNonIndexed();
    var p = g.attributes.position;
    for (var k = 0; k < p.count; k++) {
      var x = p.getX(k), y = p.getY(k), z = p.getZ(k), a = y * 0.85;
      p.setXYZ(k, x * Math.cos(a) - z * Math.sin(a), y, x * Math.sin(a) + z * Math.cos(a));
    }
    return g;
  }
  function ring(THREE) {
    var s = [new THREE.Vector2(0.38, -0.32), new THREE.Vector2(1, -0.32), new THREE.Vector2(1, 0.32), new THREE.Vector2(0.38, 0.32), new THREE.Vector2(0.38, -0.32)];
    return new THREE.LatheGeometry(s, 64);
  }
  function grounded(THREE, geo) {
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    var b = geo.boundingBox, c = new THREE.Vector3();
    b.getCenter(c);
    geo.translate(-c.x, -b.min.y, -c.z);
    return geo;
  }
  function plate(THREE, size) {
    var g = new THREE.Group();
    var bed = new THREE.Mesh(new THREE.CylinderGeometry(size, size, 0.05, 72), new THREE.MeshBasicMaterial({ color: 0x0c1822 }));
    bed.position.y = -0.035;
    g.add(bed);
    var grid = new THREE.GridHelper(size * 2, Math.round(size * 6), 0x1d4a5c, 0x12303d);
    grid.position.y = 0.001;
    g.add(grid);
    return g;
  }

  // Peças do projeto de exemplo "kit_mesa_rpg"
  function parts(THREE) {
    return [
      { key: 'vase',  geo: twistedVase(THREE),                              color: 'cyan',   s: 0.95, x: -0.2, z: -0.6, ry: 0 },
      { key: 'tower', geo: new THREE.BoxGeometry(0.75, 1.7, 0.75),          color: 'yellow', s: 1,    x: -1.75, z: 0.2, ry: 0.4 },
      { key: 'spool', geo: ring(THREE),                                     color: 'white',  s: 0.6,  x: 1.55, z: -0.85, ry: 0 },
      { key: 'd20',   geo: new THREE.IcosahedronGeometry(0.5, 0).toNonIndexed(), color: 'orange', s: 1, x: 0.95, z: 0.9, ry: 0.3 },
      { key: 'd20b',  geo: new THREE.IcosahedronGeometry(0.5, 0).toNonIndexed(), color: 'orange', s: 1, x: 1.9, z: 0.45, ry: 1.1 },
      { key: 'cube',  geo: new THREE.BoxGeometry(0.7, 0.7, 0.7),            color: 'grey',   s: 1,    x: -0.75, z: 1.35, ry: 0.2 }
    ];
  }

  // Destaques por funcionalidade (peças que acendem)
  var HIGHLIGHT = {
    many: null,
    dup: ['d20', 'd20b'],
    slicer: ['vase'],
    rename: ['d20b'],
    project: 'all'
  };

  var hero = null;

  function initHero(THREE) {
    var host = document.getElementById('viewer3d');
    if (!host) return;
    var renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch (e) { return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    host.insertBefore(renderer.domElement, host.firstChild);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    var group = new THREE.Group();
    group.add(plate(THREE, 2.7));
    var meshes = {};
    var wire = new THREE.MeshBasicMaterial({ color: 0x22d3ee, wireframe: true, transparent: true, opacity: 0.5 });
    parts(THREE).forEach(function (p) {
      var geo = grounded(THREE, p.geo);
      var m = new THREE.Mesh(geo, layerMaterial(THREE, COLORS[p.color], 26));
      m.userData.solid = m.material;
      m.scale.setScalar(p.s);
      m.position.set(p.x, 0, p.z);
      m.rotation.y = p.ry;
      group.add(m);
      meshes[p.key] = m;
    });
    scene.add(group);

    function resize() {
      var w = host.clientWidth, h = host.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // afasta a câmera em telas estreitas para a mesa caber inteira
      var dist = camera.aspect < 1 ? 10.5 / Math.max(camera.aspect, 0.6) : 10.5;
      camera.position.set(0, dist * 0.5, dist);
      camera.lookAt(0, 0.55, 0);
      camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener('resize', resize);

    var rotY = 0.35, rotX = 0, dragging = false, lastX = 0, lastY = 0, idle = 0;
    var cv = renderer.domElement;
    cv.addEventListener('pointerdown', function (e) { dragging = true; lastX = e.clientX; lastY = e.clientY; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      rotY += (e.clientX - lastX) * 0.01;
      rotX = Math.max(-0.3, Math.min(0.35, rotX + (e.clientY - lastY) * 0.005));
      lastX = e.clientX; lastY = e.clientY; idle = 0;
      if (reduceMotion) draw();
    });
    cv.addEventListener('pointerup', function () { dragging = false; });
    cv.addEventListener('pointercancel', function () { dragging = false; });

    document.querySelectorAll('[data-view]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var isWire = btn.getAttribute('data-view') === 'wire';
        Object.keys(meshes).forEach(function (k) { meshes[k].material = isWire ? wire : meshes[k].userData.solid; });
        document.querySelectorAll('[data-view]').forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
        if (reduceMotion) draw();
      });
    });

    // alvo de brilho/escurecimento por peça, com transição suave
    var target = {};
    function setHighlight(name) {
      var h = HIGHLIGHT[name];
      Object.keys(meshes).forEach(function (k) {
        var on = h === 'all' || (Array.isArray(h) && h.indexOf(k) !== -1);
        var dim = Array.isArray(h) && !on;
        target[k] = { glow: on && h !== 'all' ? 1 : 0, dim: dim ? 0.38 : 1 };
      });
      if (reduceMotion) { Object.keys(meshes).forEach(function (k) { var u = meshes[k].userData.solid.uniforms; u.uGlow.value = target[k].glow; u.uDim.value = target[k].dim; }); draw(); }
    }

    function draw() {
      group.rotation.y = rotY;
      group.rotation.x = rotX;
      renderer.render(scene, camera);
    }

    var visible = true;
    if ('IntersectionObserver' in window) new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }).observe(host);
    function loop() {
      requestAnimationFrame(loop);
      if (!visible) return;
      if (!dragging) { idle++; if (idle > 90) rotY += 0.0035; }
      Object.keys(target).forEach(function (k) {
        var u = meshes[k].userData.solid.uniforms;
        u.uGlow.value += (target[k].glow - u.uGlow.value) * 0.08;
        u.uDim.value += (target[k].dim - u.uDim.value) * 0.08;
      });
      draw();
    }
    if (reduceMotion) draw(); else loop();

    hero = { setHighlight: setHighlight };
  }

  // ---------- Funcionalidades: alternância automática ----------
  function initFeatures() {
    var list = document.getElementById('features');
    var feats = Array.prototype.slice.call(document.querySelectorAll('.feat'));
    var cap = document.getElementById('caption');
    if (!feats.length || !cap) return;
    var CYCLE = 4500, idx = 0, timer = null, paused = false;

    function show(i) {
      idx = i;
      feats.forEach(function (f, j) {
        f.setAttribute('aria-pressed', String(j === i));
        var bar = f.querySelector('.bar');
        if (bar) { bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; }
      });
      var f = feats[i];
      cap.classList.add('swap');
      setTimeout(function () {
        cap.querySelector('.k').textContent = f.getAttribute('data-k');
        cap.querySelector('.txt').innerHTML = f.getAttribute('data-caption');
        cap.classList.toggle('warm', f.getAttribute('data-name') === 'dup' || f.getAttribute('data-name') === 'rename');
        cap.classList.remove('swap');
      }, reduceMotion ? 0 : 200);
      if (hero) hero.setHighlight(f.getAttribute('data-name'));
    }
    function schedule() {
      clearTimeout(timer);
      if (reduceMotion || paused) return;
      timer = setTimeout(function () { show((idx + 1) % feats.length); schedule(); }, CYCLE);
    }
    feats.forEach(function (f, i) {
      f.addEventListener('click', function () { show(i); schedule(); });
    });
    list.addEventListener('mouseenter', function () { paused = true; list.classList.add('paused'); clearTimeout(timer); });
    list.addEventListener('mouseleave', function () { paused = false; list.classList.remove('paused'); show(idx); schedule(); });
    show(0);
    schedule();
  }

  function init() {
    if (window.THREE) initHero(window.THREE);
    initFeatures();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  // ---------- Download + link de login ----------
  fetch('https://api.github.com/repos/pvbsiqueira/Vault3D/releases/latest')
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (!data) return;
      if (data.tag_name) document.querySelectorAll('[data-version]').forEach(function (el) { el.textContent = data.tag_name.replace(/^v/, ''); });
      if (Array.isArray(data.assets)) {
        var exe = data.assets.find(function (a) { return a.name && a.name.toLowerCase().endsWith('.exe'); });
        if (exe && exe.browser_download_url) document.querySelectorAll('[data-download]').forEach(function (b) { b.href = exe.browser_download_url; });
      }
    })
    .catch(function (err) { console.warn('Usando link de download padrão:', err); });

  var hash = window.location.hash || '';
  var search = window.location.search || '';
  if (hash.includes('access_token=') || hash.includes('code=') || search.includes('code=') || hash.includes('token_hash=') || search.includes('token_hash=')) {
    var banner = document.getElementById('deepLinkBanner');
    var btnOpen = document.getElementById('btnOpenDeepLink');
    var deepLinkUrl = 'vault3d://auth' + hash + (search ? (hash ? '&' : '?') + search.substring(1) : '');
    if (banner && btnOpen) {
      btnOpen.href = deepLinkUrl;
      banner.classList.add('active');
      try { window.location.href = deepLinkUrl; } catch (e) { console.warn('Abertura automática do vault3d:// bloqueada:', e); }
    }
  }
})();
