// BabylonJS Powerups 3D Preview
document.addEventListener('DOMContentLoaded', () => {
  const POWERUPS = [
    'ADD_BALL',
    'INCREASE_PADDLE_SPEED',
    'DECREASE_PADDLE_SPEED',
    'SUPER_SPEED',
    'INCREASE_BALL_SIZE',
    'DECREASE_BALL_SIZE',
    'REVERSE_CONTROLS'
  ];

  const canvas = document.getElementById('renderCanvas');
  const engine = new BABYLON.Engine(canvas, true, {preserveDrawingBuffer:true, stencil:true});

  const createScene = function(){
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.06,0.06,0.08,1);

    const camera = new BABYLON.ArcRotateCamera('cam', -Math.PI/2.5, Math.PI/3.6, 40, new BABYLON.Vector3(0,4,0), scene);
    camera.attachControl(canvas, true);
    camera.wheelPrecision = 50;

    const light = new BABYLON.HemisphericLight('h1', new BABYLON.Vector3(0.7,1,0.3), scene);
    light.intensity = 0.9;
    const dirLight = new BABYLON.DirectionalLight('dl', new BABYLON.Vector3(-0.5,-1,0.4), scene);
    dirLight.position = new BABYLON.Vector3(20,40,20);
    dirLight.intensity = 0.6;

    // Environment for PBR reflections
    try{
      const envTex = BABYLON.CubeTexture.CreateFromPrefilteredData('https://playground.babylonjs.com/textures/environment.dds', scene);
      scene.environmentTexture = envTex;
      scene.environmentIntensity = 0.9;
    }catch(e){ /* ignore if not loadable */ }

    // shadows + glow for nicer visuals
    const shadowGen = new BABYLON.ShadowGenerator(2048, dirLight);
    shadowGen.useBlurExponentialShadowMap = true;
    shadowGen.blurKernel = 32;
    const glow = new BABYLON.GlowLayer('glow', scene);
    glow.intensity = 0.35;

    // ground plane for reference
    const ground = BABYLON.MeshBuilder.CreateGround('g', {width:60, height:40}, scene);
    ground.position.y = -0.1;
    const groundMat = new BABYLON.PBRMaterial('gm', scene);
    groundMat.albedoColor = new BABYLON.Color3(0.09,0.09,0.11);
    groundMat.roughness = 1.0;
    ground.material = groundMat;
    ground.receiveShadows = true;

    const group = new BABYLON.TransformNode('powerupsRoot', scene);

    // helper to make a labeled plane
    function makeLabelPlane(text){
      const dt = new BABYLON.DynamicTexture('dt'+text, {width:512,height:128}, scene, false);
      dt.hasAlpha = true;
      dt.drawText(text, null, 80, "bold 48px Arial", "#e9eef8", "transparent", true);
      const plane = BABYLON.MeshBuilder.CreatePlane('lbl'+text, {width:6, height:1.6}, scene);
      const mat = new BABYLON.StandardMaterial('matlbl'+text, scene);
      mat.emissiveTexture = dt; mat.diffuseColor = BABYLON.Color3.Black(); mat.emissiveColor = new BABYLON.Color3(0.96,0.96,0.98);
      mat.backFaceCulling = false; plane.material = mat;
      plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
      return plane;
    }

    // helper: create a framed icon plate (thin box + inner plane with rounded gradient)
    function makeIconPlate(name, color){
      const plateRoot = new BABYLON.TransformNode('plateRoot_'+name, scene);
      // thin base box to give thickness
      const base = BABYLON.MeshBuilder.CreateBox('plateBase_'+name, {height:0.9, width:8.8, depth:8.8}, scene);
      const baseMat = new BABYLON.PBRMaterial('baseMat_'+name, scene);
      baseMat.albedoColor = new BABYLON.Color3(0.15,0.15,0.17);
      baseMat.roughness = 0.6; baseMat.metallic = 0.02;
      base.material = baseMat; base.parent = plateRoot; base.receiveShadows = true;

      // inner inset plane with rounded corners drawn to dynamic texture
      const inner = BABYLON.MeshBuilder.CreatePlane('plateInner_'+name, {width:7.6, height:7.6}, scene);
      inner.parent = plateRoot; inner.position.y = 0.46; // slightly above base

      const dt = new BABYLON.DynamicTexture('dt_'+name, {width:1024, height:1024}, scene, false);
      const ctx2d = dt.getContext();
      // draw rounded gradient
      const w = 1024, h = 1024, r = 140;
      function drawRoundedRect(){
        ctx2d.clearRect(0,0,w,h);
        const g = ctx2d.createLinearGradient(0,0,0,h);
        g.addColorStop(0, 'rgba('+Math.floor(color.r*255)+','+Math.floor(color.g*255)+','+Math.floor(color.b*255)+',1)');
        g.addColorStop(1, 'rgba('+Math.floor(color.r*255*0.6)+','+Math.floor(color.g*255*0.6)+','+Math.floor(color.b*255*0.6)+',1)');
        // path
        ctx2d.beginPath(); ctx2d.moveTo(r,0); ctx2d.lineTo(w-r,0); ctx2d.quadraticCurveTo(w,0,w,r); ctx2d.lineTo(w,h-r); ctx2d.quadraticCurveTo(w,h,w-r,h); ctx2d.lineTo(r,h); ctx2d.quadraticCurveTo(0,h,0,h-r); ctx2d.lineTo(0,r); ctx2d.quadraticCurveTo(0,0,r,0); ctx2d.closePath();
        ctx2d.fillStyle = g; ctx2d.fill();
        // vignette
        ctx2d.fillStyle = 'rgba(0,0,0,0.08)'; ctx2d.fill();
        // soft highlight
        ctx2d.beginPath(); ctx2d.moveTo(r,30); ctx2d.quadraticCurveTo(w/2,60,w- r,30); ctx2d.lineTo(w-r,110); ctx2d.quadraticCurveTo(w/2,80,r,110); ctx2d.closePath(); ctx2d.fillStyle = 'rgba(255,255,255,0.06)'; ctx2d.fill();
      }
      drawRoundedRect(); dt.update();

      const innerMat = new BABYLON.StandardMaterial('innerMat_'+name, scene);
      innerMat.emissiveTexture = dt; innerMat.backFaceCulling = false; inner.material = innerMat;

      // slight rim plate (frame) using another thin box scaled slightly bigger
      const rim = BABYLON.MeshBuilder.CreateBox('rim_'+name, {height:1.0, width:9.2, depth:9.2}, scene);
      const rimMat = new BABYLON.PBRMaterial('rimMat_'+name, scene); rimMat.albedoColor = new BABYLON.Color3(0.82,0.82,0.85); rimMat.roughness = 0.7; rim.material = rimMat; rim.parent = plateRoot; rim.position.y = -0.05;

      // subtle glass plane on top for gloss
      const glass = BABYLON.MeshBuilder.CreatePlane('glass_'+name, {width:7.6, height:7.6}, scene);
      const gmat = new BABYLON.StandardMaterial('gmat_'+name, scene); gmat.alpha = 0.06; gmat.diffuseColor = BABYLON.Color3.White(); glass.material = gmat; glass.parent = plateRoot; glass.position.y = 0.52;

      return plateRoot;
    }

    // Powerup creators
    function createAddBall(){
      const root = new BABYLON.TransformNode('addBall', scene);
      const plate = makeIconPlate('addBall', new BABYLON.Color3(1,0.8,0.4));
      root.parent = plate; // position children relative to plate
      const mat = new BABYLON.PBRMaterial('m1', scene); mat.albedoColor = new BABYLON.Color3(1,0.8,0.4); mat.metallic = 0.05; mat.roughness = 0.35;
      const big = BABYLON.MeshBuilder.CreateSphere('b', {diameter:4}, scene); big.material = mat; big.parent = root; shadowGen.addShadowCaster(big);
      const smallMat = new BABYLON.PBRMaterial('m2', scene); smallMat.albedoColor = new BABYLON.Color3(0.9,0.3,0.5); smallMat.roughness = 0.4;
      const small = BABYLON.MeshBuilder.CreateSphere('s', {diameter:1.6}, scene); small.position = new BABYLON.Vector3(2.2,1.2,0.8); small.material = smallMat; small.parent = root; shadowGen.addShadowCaster(small);
      const plus = makeLabelPlane('+'); plus.position = new BABYLON.Vector3(0,-3.5,0); plus.parent = root;
      // adjust root so plate forms the base at y=0
      root.position.y = 0.2;
      return plate;
    }

    function createBallSize(big=true){
      const root = new BABYLON.TransformNode('ballSz'+(big?'Big':'Small'), scene);
      const plate = makeIconPlate('ballsize_'+(big?'big':'small'), new BABYLON.Color3(0.4,0.7,1));
      root.parent = plate; root.position.y = 0.2;
      const d = big?6:2.8;
      const mat = new BABYLON.PBRMaterial('bmat'+d, scene); mat.albedoColor = new BABYLON.Color3(0.4,0.7,1); mat.roughness = 0.3;
      const s = BABYLON.MeshBuilder.CreateSphere('sph'+d, {diameter:d}, scene); s.material = mat; s.parent = root; shadowGen.addShadowCaster(s);
      const lbl = makeLabelPlane(big?'+ SIZE':'- SIZE'); lbl.position.y = - (d/2 + 1.8); lbl.parent = root;
      return plate;
    }

    function createSuperSpeed(){
      const root = new BABYLON.TransformNode('super', scene);
      // approximate bolt using two boxes
        const mat = new BABYLON.PBRMaterial('boltMat', scene); mat.emissiveColor = new BABYLON.Color3(0.9,1,1); mat.albedoColor = new BABYLON.Color3(0.18,0.8,0.95); mat.roughness = 0.12; mat.emissivePower = 0.9;
      const part1 = BABYLON.MeshBuilder.CreateBox('b1', {height:0.6, width:1.4, depth:3.8}, scene); part1.parent = root; part1.material = mat; part1.rotation.z = Math.PI/9; part1.position.y = 0.6;
        const part2 = BABYLON.MeshBuilder.CreateBox('b2', {height:0.5, width:1.2, depth:4.4}, scene); part2.parent = root; part2.material = mat; part2.rotation.z = -Math.PI/8; part2.position.y = -1.4; part2.position.x = 0.8; shadowGen.addShadowCaster(part2);
        const trail = BABYLON.MeshBuilder.CreateTorus('trail', {thickness:0.2, diameter:2.5, tessellation:32}, scene); trail.parent = root; trail.position.z = -0.8; trail.scaling.x = 1.6; trail.material = mat; trail.rotation.x = Math.PI/2; trail.visibility = 0.22;
      const lbl = makeLabelPlane('SUPER SPEED'); lbl.position.y = -3.5; lbl.parent = root;
      return plate;
    }

    function createPaddle(up=true){
      // stacked triangular prism + rectangular base, with PBR materials and a slight tilt for depth
      const root = new BABYLON.TransformNode('paddle'+(up?'Up':'Down'), scene);
      const plate = makeIconPlate('paddle_'+(up?'up':'down'), new BABYLON.Color3(0.98,0.55,0.78));
      root.parent = plate; root.position.y = 0.2;
      const triMat = new BABYLON.PBRMaterial('triMat', scene); triMat.albedoColor = new BABYLON.Color3(0.98,0.55,0.78); triMat.metallic = 0.02; triMat.roughness = 0.45;
      const rectMat = new BABYLON.PBRMaterial('rectMat', scene); rectMat.albedoColor = new BABYLON.Color3(0.98,0.55,0.78); rectMat.roughness = 0.5;

      // triangular prism using a low-tessellation cylinder (tessellation=3)
      const tri = BABYLON.MeshBuilder.CreateCylinder('tri', {diameter:9, height:5, tessellation:3}, scene);
      tri.material = triMat; tri.parent = root; tri.receiveShadows = true; shadowGen.addShadowCaster(tri);
      // make the triangle point up or down and tilt a bit for a 3D silhouette
      tri.rotation.x = Math.PI/2; // lay it flat then rotate to face camera nicely
      if(up){ tri.rotation.z = Math.PI; tri.position.y = 1.8; tri.rotation.y = 0.12; }
      else { tri.rotation.z = 0; tri.position.y = -1.8; tri.rotation.y = -0.12; }

      // rectangle base under (or over) the triangle
      const rect = BABYLON.MeshBuilder.CreateBox('rect', {height:1.8, depth:2.8, width:9.6}, scene);
      rect.material = rectMat; rect.parent = root; rect.receiveShadows = true; shadowGen.addShadowCaster(rect);
      if(up){ rect.position.y = -2.0; rect.rotation.y = -0.06; }
      else { rect.position.y = 2.0; rect.rotation.y = 0.06; }

      // subtle bevel illusion: add thin top inset to rect
      const inset = BABYLON.MeshBuilder.CreateBox('inset', {height:0.3, depth:2.9, width:9.2}, scene);
      const insetMat = new BABYLON.PBRMaterial('insetMat', scene); insetMat.albedoColor = new BABYLON.Color3(1,0.85,0.9); insetMat.roughness = 0.25; inset.material = insetMat; inset.parent = root;

      const lbl = makeLabelPlane(up? 'INCREASE PADDLE' : 'DECREASE PADDLE'); lbl.position.y = -4.0; lbl.parent = root;
      return plate;
    }

    function createReverseControls(){
      const root = new BABYLON.TransformNode('rev', scene);
      const plate = makeIconPlate('reverse', new BABYLON.Color3(0.96,0.96,0.96));
      root.parent = plate; root.position.y = 0.2;
      const boxMat = new BABYLON.PBRMaterial('boxMat', scene); boxMat.albedoColor = new BABYLON.Color3(0.96,0.96,0.96); boxMat.roughness = 0.35; boxMat.metallic = 0.02;
      const shaftMat = new BABYLON.PBRMaterial('shaftMat2', scene); shaftMat.albedoColor = new BABYLON.Color3(0.06,0.06,0.06); shaftMat.roughness = 0.18;

      const leftBox = BABYLON.MeshBuilder.CreateBox('leftBox', {height:1.2, width:4.2, depth:4.2}, scene);
      leftBox.material = boxMat; leftBox.parent = root; leftBox.position.x = -3.2; leftBox.position.y = 0.6; leftBox.receiveShadows = true; shadowGen.addShadowCaster(leftBox);
      const rightBox = leftBox.clone('rightBox'); rightBox.parent = root; rightBox.position.x = 3.2;

      const leftShaft = BABYLON.MeshBuilder.CreateBox('lshaft', {height:0.2, width:2.2, depth:0.12}, scene); leftShaft.material = shaftMat; leftShaft.parent = root; leftShaft.position.set(-2.1,0.6,0.2); shadowGen.addShadowCaster(leftShaft);
      const rightShaft = BABYLON.MeshBuilder.CreateBox('rshaft', {height:0.2, width:2.2, depth:0.12}, scene); rightShaft.material = shaftMat; rightShaft.parent = root; rightShaft.position.set(2.1,0.6,0.2); shadowGen.addShadowCaster(rightShaft);

      const leftHead = BABYLON.MeshBuilder.CreateCylinder('lhead', {height:0.6, diameterTop:0, diameterBottom:0.6, tessellation:24}, scene);
      leftHead.material = shaftMat; leftHead.parent = root; leftHead.position.set(-0.95,0.6,0.2); leftHead.rotation.z = Math.PI/2; shadowGen.addShadowCaster(leftHead);
      const rightHead = leftHead.clone('rhead'); rightHead.parent = root; rightHead.position.set(0.95,0.6,0.2); rightHead.rotation.z = -Math.PI/2;

      const highlight = BABYLON.MeshBuilder.CreatePlane('hlight', {width:3.8, height:0.7}, scene); highlight.parent = leftBox; highlight.position.y = 0.9; highlight.position.z = -0.05; const hmat = new BABYLON.StandardMaterial('hmat', scene); hmat.diffuseColor = new BABYLON.Color3(1,1,1); hmat.alpha = 0.06; highlight.material = hmat;
      const highlight2 = highlight.clone('hlight2'); highlight2.parent = rightBox; highlight2.position.x = 0; highlight2.position.y = 0.9;

      const lbl = makeLabelPlane('REVERSE CONTROLS'); lbl.position.y = -3.2; lbl.parent = root;
      return plate;
    }

    // create all instances and position them
    const creators = {
      'ADD_BALL': createAddBall,
      'INCREASE_PADDLE_SPEED': ()=>createPaddle(true),
      'DECREASE_PADDLE_SPEED': ()=>createPaddle(false),
      'SUPER_SPEED': createSuperSpeed,
      'INCREASE_BALL_SIZE': ()=>createBallSize(true),
      'DECREASE_BALL_SIZE': ()=>createBallSize(false),
      'REVERSE_CONTROLS': createReverseControls
    };

    const nodes = {};
    const spacingX = 14; const spacingZ = 12; let i = 0;
    POWERUPS.forEach((p, idx) => {
      const node = creators[p](); node.parent = group; nodes[p] = node;
      const col = idx % 4; const row = Math.floor(idx / 4);
      node.position.x = (col - 1.5) * spacingX;
      node.position.z = row * spacingZ - 6;
      node.position.y = 2.5;
    });

    // helper to show single powerup
    function showSingle(name){
      Object.keys(nodes).forEach(k=>{ nodes[k].setEnabled(k===name); });
      const n = nodes[name]; if(n){ camera.setTarget(n.getAbsolutePosition()); }
    }

    function showAll(){ Object.keys(nodes).forEach(k=>nodes[k].setEnabled(true)); camera.setTarget(BABYLON.Vector3.Zero()); }

    // basic animations
    scene.registerBeforeRender(()=>{
      const t = performance.now() * 0.001;
      if(nodes['ADD_BALL']) nodes['ADD_BALL'].rotation.y = t*0.6;
      if(nodes['SUPER_SPEED']) nodes['SUPER_SPEED'].scaling.x = 1 + Math.sin(t*8)*0.06;
      if(nodes['INCREASE_BALL_SIZE']) nodes['INCREASE_BALL_SIZE'].position.y = 2.5 + Math.sin(t*2)*0.4;
    });

    return {scene, showSingle, showAll, nodes, camera};
  };

  const created = createScene();

  // UI wiring
  const select = document.getElementById('powerupSelect');
  const showAllBtn = document.getElementById('showAll');
  POWERUPS.forEach(p=>{ const o = document.createElement('option'); o.value = p; o.textContent = p; select.appendChild(o); });
  select.addEventListener('change', ()=>{ created.showSingle(select.value); });
  showAllBtn.addEventListener('click', ()=>{ created.showAll(); });

  // default: show all
  created.showAll();

  engine.runRenderLoop(()=>{ created.scene.render(); });
  window.addEventListener('resize', ()=>{ engine.resize(); });
});
