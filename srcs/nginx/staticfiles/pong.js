function startPongGame() {
  const canvas = document.getElementById("renderCanvas");
  const engine = new BABYLON.Engine(canvas, true);
  const scene = new BABYLON.Scene(engine);

  // ===== Game State =====
  const gameState = {
    ballSpeed: 0.15,
    baseBallSpeed: 0.15,
    speedMultiplier: 1.0,
    maxSpeedMultiplier: 2.5,
    paddleSpeed: 0.25,
    leftScore: 0,
    rightScore: 0,
    ballDirection: { x: 1, y: 0.5 },
    keys: {},
    trailPositions: [],
    ballAnimationState: 'normal',
    ballAnimationTimer: 0,
    squashDuration: 0.15,
    stretchDuration: 0.1,
    squashAxis: "y",
    originalBallScale: { x: 1, y: 1, z: 1 },
    cameraShakeTime: 0,
    cameraShakeDuration: 0.1,
    cameraShakeIntensity: 0
  };

  // ===== Video Background =====
  const backgroundPlane = BABYLON.MeshBuilder.CreatePlane("backgroundPlane", { width: 40, height: 25 }, scene);
  backgroundPlane.position.z = 8;

  const videoTexture = new BABYLON.VideoTexture("videoTexture", ["https://localhost:4430/static/catground.mp4"], scene, true, true);
  videoTexture.video.loop = true;
  videoTexture.video.muted = true;
  videoTexture.video.autoplay = true;
  videoTexture.video.play().catch(e => console.log('Video play failed:', e));

  const backgroundMaterial = new BABYLON.StandardMaterial("backgroundMaterial", scene);
  backgroundMaterial.diffuseTexture = videoTexture;
  backgroundMaterial.disableLighting = true;
  backgroundMaterial.emissiveTexture = videoTexture;
  backgroundMaterial.emissiveColor = new BABYLON.Color3(1, 1, 1);
  backgroundPlane.material = backgroundMaterial;
  backgroundPlane.receiveShadows = false;

  // ===== Camera =====
  const camera = new BABYLON.FreeCamera("camera", new BABYLON.Vector3(0, 0, -15), scene);
  camera.setTarget(new BABYLON.Vector3(0, 0, 0));

  // ===== Lighting with Shadows =====
  const directionalLight = new BABYLON.DirectionalLight("directionalLight", new BABYLON.Vector3(0, -0.5, 1), scene);
  directionalLight.position = new BABYLON.Vector3(0, 6, -20);
  directionalLight.intensity = 2.2;

  const shadowGenerator = new BABYLON.ShadowGenerator(2048, directionalLight);
  shadowGenerator.useExponentialShadowMap = true;
  shadowGenerator.useKernelBlur = true;
  shadowGenerator.blurKernel = 64;
  shadowGenerator.bias = 0.0005;

  const ballLight = new BABYLON.PointLight("ballLight", new BABYLON.Vector3(0, 0, 0), scene);
  ballLight.diffuse = new BABYLON.Color3(0.2, 0.6, 1.0);
  ballLight.specular = new BABYLON.Color3(0.4, 0.8, 1.0);
  ballLight.intensity = 3.0;
  ballLight.range = 8.0;
  ballLight.falloffType = BABYLON.Light.FALLOFF_GLTF;

  // ===== Game Objects =====
  const leftPaddle = BABYLON.MeshBuilder.CreateBox("leftPaddle", { width: 0.3, height: 3, depth: 0.3 }, scene);
  leftPaddle.position.x = -10;
  const rightPaddle = BABYLON.MeshBuilder.CreateBox("rightPaddle", { width: 0.3, height: 3, depth: 0.3 }, scene);
  rightPaddle.position.x = 10;

  const ball = BABYLON.MeshBuilder.CreateSphere("ball", { diameter: 0.4 }, scene);
  ball.position.set(0, 0, 0);

  const topWall = BABYLON.MeshBuilder.CreateBox("topWall", { width: 25, height: 0.3, depth: 0.3 }, scene);
  topWall.position.y = 6;
  const bottomWall = BABYLON.MeshBuilder.CreateBox("bottomWall", { width: 25, height: 0.3, depth: 0.3 }, scene);
  bottomWall.position.y = -6;

  const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 30, height: 18 }, scene);
  ground.position.z = 3;
  ground.visibility = 0.3;

  const backWall = BABYLON.MeshBuilder.CreatePlane("backWall", { width: 30, height: 18 }, scene);
  backWall.position.z = 5;
  backWall.visibility = 0.2;

  // ===== Fire Particle System =====
  const fireParticleSystem = new BABYLON.ParticleSystem("fire", 300, scene);
  fireParticleSystem.particleTexture = new BABYLON.Texture("https://www.babylonjs-playground.com/textures/flare.png", scene);
  fireParticleSystem.emitter = ball;
  fireParticleSystem.minEmitBox = new BABYLON.Vector3(-0.1, -0.1, -0.1);
  fireParticleSystem.maxEmitBox = new BABYLON.Vector3(0.1, 0.1, 0.1);
  fireParticleSystem.color1 = new BABYLON.Color4(1, 0.5, 0, 1.0);
  fireParticleSystem.color2 = new BABYLON.Color4(1, 0.8, 0, 1.0);
  fireParticleSystem.colorDead = new BABYLON.Color4(0.5, 0, 0, 0.0);
  fireParticleSystem.minSize = 0.2;
  fireParticleSystem.maxSize = 0.8;
  fireParticleSystem.minLifeTime = 0.3;
  fireParticleSystem.maxLifeTime = 1.0;
  fireParticleSystem.emitRate = 80;
  fireParticleSystem.direction1 = new BABYLON.Vector3(-1, -1, -1);
  fireParticleSystem.direction2 = new BABYLON.Vector3(1, 1, 1);
  fireParticleSystem.minEmitPower = 0.5;
  fireParticleSystem.maxEmitPower = 2.0;
  fireParticleSystem.updateSpeed = 0.01;
  fireParticleSystem.gravity = new BABYLON.Vector3(0, -2, 0);
  fireParticleSystem.blendMode = BABYLON.ParticleSystem.BLENDMODE_ONEONE;
  fireParticleSystem.start();

  // ===== Comet Trail System =====
  const trailParticleSystem = new BABYLON.ParticleSystem("trail", 200, scene);
  trailParticleSystem.particleTexture = new BABYLON.Texture("https://www.babylonjs-playground.com/textures/flare.png", scene);
  trailParticleSystem.emitter = ball;
  trailParticleSystem.minEmitBox = new BABYLON.Vector3(0, 0, 0);
  trailParticleSystem.maxEmitBox = new BABYLON.Vector3(0, 0, 0);
  trailParticleSystem.color1 = new BABYLON.Color4(0.2, 0.8, 1, 0.8);
  trailParticleSystem.color2 = new BABYLON.Color4(0.5, 1, 1, 0.6);
  trailParticleSystem.colorDead = new BABYLON.Color4(0, 0, 0.5, 0);
  trailParticleSystem.minSize = 0.1;
  trailParticleSystem.maxSize = 0.3;
  trailParticleSystem.minLifeTime = 0.8;
  trailParticleSystem.maxLifeTime = 1.5;
  trailParticleSystem.emitRate = 60;
  trailParticleSystem.direction1 = new BABYLON.Vector3(-0.2, -0.2, -0.2);
  trailParticleSystem.direction2 = new BABYLON.Vector3(0.2, 0.2, 0.2);
  trailParticleSystem.minEmitPower = 0.2;
  trailParticleSystem.maxEmitPower = 0.8;
  trailParticleSystem.updateSpeed = 0.01;
  trailParticleSystem.gravity = new BABYLON.Vector3(0, 0, 0);
  trailParticleSystem.blendMode = BABYLON.ParticleSystem.BLENDMODE_ONEONE;
  trailParticleSystem.start();

  // ===== Materials =====
  const paddleMaterial = new BABYLON.StandardMaterial("paddleMaterial", scene);
  paddleMaterial.diffuseColor = new BABYLON.Color3(0.9, 0.9, 0.9);
  paddleMaterial.specularColor = new BABYLON.Color3(1, 1, 1);
  paddleMaterial.specularPower = 128;
  paddleMaterial.reflectionTexture = new BABYLON.CubeTexture.CreateFromPrefilteredData("https://playground.babylonjs.com/textures/environment.env", scene);
  paddleMaterial.reflectionFresnelParameters = new BABYLON.FresnelParameters();
  paddleMaterial.reflectionFresnelParameters.bias = 0.1;
  paddleMaterial.reflectionFresnelParameters.power = 0.5;
  paddleMaterial.reflectionFresnelParameters.leftColor = BABYLON.Color3.White();
  paddleMaterial.reflectionFresnelParameters.rightColor = BABYLON.Color3.Black();
  leftPaddle.material = paddleMaterial;
  rightPaddle.material = paddleMaterial;

  const ballMaterial = new BABYLON.StandardMaterial("ballMaterial", scene);
  ballMaterial.diffuseColor = new BABYLON.Color3(0.8, 0.9, 1);
  ballMaterial.emissiveColor = new BABYLON.Color3(0.3, 0.6, 1);
  ballMaterial.specularColor = new BABYLON.Color3(0.5, 0.8, 1);
  ball.material = ballMaterial;

  const wallMaterial = new BABYLON.StandardMaterial("wallMaterial", scene);
  wallMaterial.diffuseColor = new BABYLON.Color3(0.3, 0.3, 0.8);
  topWall.material = wallMaterial;
  bottomWall.material = wallMaterial;

  const groundMaterial = new BABYLON.StandardMaterial("groundMaterial", scene);
  groundMaterial.diffuseColor = new BABYLON.Color3(0.8, 0.8, 0.8);
  groundMaterial.alpha = 1.0;
  ground.material = groundMaterial;

  const backWallMaterial = new BABYLON.StandardMaterial("backWallMaterial", scene);
  backWallMaterial.diffuseColor = new BABYLON.Color3(0.9, 0.9, 0.9);
  backWallMaterial.alpha = 1.0;
  backWall.material = backWallMaterial;

  shadowGenerator.addShadowCaster(leftPaddle);
  shadowGenerator.addShadowCaster(rightPaddle);
  shadowGenerator.addShadowCaster(ball);
  ground.receiveShadows = true;
  backWall.receiveShadows = true;

  // ===== Input Handling =====
  window.addEventListener("keydown", (e) => { gameState.keys[e.code] = true; });
  window.addEventListener("keyup", (e) => { gameState.keys[e.code] = false; });

  function updatePaddles() {
    if (gameState.keys["KeyW"] && leftPaddle.position.y < 4.5) leftPaddle.position.y += gameState.paddleSpeed;
    if (gameState.keys["KeyS"] && leftPaddle.position.y > -4.5) leftPaddle.position.y -= gameState.paddleSpeed;
    if (gameState.keys["ArrowUp"] && rightPaddle.position.y < 4.5) rightPaddle.position.y += gameState.paddleSpeed;
    if (gameState.keys["ArrowDown"] && rightPaddle.position.y > -4.5) rightPaddle.position.y -= gameState.paddleSpeed;
  }

  function updateBallEffects() {
    const trailDirection = new BABYLON.Vector3(-gameState.ballDirection.x, -gameState.ballDirection.y, 0);
    trailDirection.normalize();
    trailDirection.scaleInPlace(0.5);

    trailParticleSystem.direction1 = trailDirection.add(new BABYLON.Vector3(-0.2, -0.2, -0.2));
    trailParticleSystem.direction2 = trailDirection.add(new BABYLON.Vector3(0.2, 0.2, 0.2));

    const currentSpeed = gameState.ballSpeed;
    const speedRatio = currentSpeed / gameState.baseBallSpeed;
    fireParticleSystem.emitRate = 80 + (speedRatio - 1) * 150;

    const glowIntensity = 0.3 + (speedRatio - 1) * 0.4;
    ballMaterial.emissiveColor = new BABYLON.Color3(glowIntensity * 0.3, glowIntensity * 0.6, glowIntensity);

    ballLight.position.copyFrom(ball.position);

    const time = performance.now() * 0.003;
    const pulse = 1 + Math.sin(time * 2.2) * 0.35;
    const speedLightMultiplier = 1 + (speedRatio - 1) * 2;
    ballLight.intensity = 3.0 * speedLightMultiplier * pulse;
    ballLight.range = 8.0 + (speedRatio - 1) * 8.0 * pulse;

    const colorPulse = 0.8 + Math.sin(time * 1.5) * 0.2;
    const hueShift = 0.55 + 0.1 * Math.sin(time * 0.7);
    function hsvToRgb(h, s, v) {
      let r, g, b;
      let i = Math.floor(h * 6);
      let f = h * 6 - i;
      let p = v * (1 - s);
      let q = v * (1 - f * s);
      let t = v * (1 - (1 - f) * s);
      switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
      }
      return new BABYLON.Color3(r, g, b);
    }
    ballLight.diffuse = hsvToRgb(hueShift, 0.6, colorPulse);
    ballLight.specular = hsvToRgb(hueShift, 0.4, 1.0);
  }

  function updateBall() {
    ball.position.x += gameState.ballDirection.x * gameState.ballSpeed;
    ball.position.y += gameState.ballDirection.y * gameState.ballSpeed;

    if (ball.position.y > 5.7 || ball.position.y < -5.7) {
      gameState.ballDirection.y *= -1;
      ball.position.y = ball.position.y > 0 ? 5.7 : -5.7;
      triggerBallSquash("y", 0.08);
    }

    if (gameState.ballDirection.x < 0 && 
        ball.position.x < -9.5 && ball.position.x > -10.5 &&
        ball.position.y < leftPaddle.position.y + 1.5 &&
        ball.position.y > leftPaddle.position.y - 1.5) {
      gameState.ballDirection.x = Math.abs(gameState.ballDirection.x);
      gameState.ballDirection.y += (ball.position.y - leftPaddle.position.y) * 0.3;
      ball.position.x = -9.5;
      increaseSpeed();
      triggerBallSquash("x", 0.15);
    }

    if (gameState.ballDirection.x > 0 &&
        ball.position.x > 9.5 && ball.position.x < 10.5 &&
        ball.position.y < rightPaddle.position.y + 1.5 &&
        ball.position.y > rightPaddle.position.y - 1.5) {
      gameState.ballDirection.x = -Math.abs(gameState.ballDirection.x);
      gameState.ballDirection.y += (ball.position.y - rightPaddle.position.y) * 0.3;
      ball.position.x = 9.5;
      increaseSpeed();
      triggerBallSquash("x", 0.15);
    }

    if (ball.position.x > 12) { gameState.leftScore++; updateScore(); resetBall(); }
    else if (ball.position.x < -12) { gameState.rightScore++; updateScore(); resetBall(); }
    
    updateBallEffects();
  }

  function increaseSpeed() {
    if (gameState.speedMultiplier < gameState.maxSpeedMultiplier) {
      gameState.speedMultiplier += 0.1;
      gameState.ballSpeed = gameState.baseBallSpeed * gameState.speedMultiplier;
    }
  }

  function resetBall() {
    ball.position.set(0, 0, 0);
    gameState.ballDirection.x = Math.random() > 0.5 ? 1 : -1;
    gameState.ballDirection.y = (Math.random() - 0.5) * 0.8;
    gameState.speedMultiplier = 1.0;
    gameState.ballSpeed = gameState.baseBallSpeed;
    gameState.ballAnimationState = 'normal';
    gameState.ballAnimationTimer = 0;
    ball.scaling.set(1, 1, 1);
    fireParticleSystem.reset();
    trailParticleSystem.reset();
  }

  function updateScore() {
    document.getElementById("leftScore").textContent = gameState.leftScore;
    document.getElementById("rightScore").textContent = gameState.rightScore;
  }

  function triggerBallSquash(axis, shakeStrength) {
    const speed = gameState.ballSpeed;
    const minDuration = 0.06;
    const maxDuration = 0.18;
    const baseSpeed = gameState.baseBallSpeed;
    const speedRatio = Math.min(speed / baseSpeed, gameState.maxSpeedMultiplier);
    const squashDuration = Math.max(maxDuration / speedRatio, minDuration);

    gameState.ballAnimationState = 'squashing';
    gameState.ballAnimationTimer = 0;
    gameState.squashDuration = squashDuration;
    gameState.stretchDuration = squashDuration * 0.7;
    gameState.squashAxis = axis;
    gameState.cameraShakeTime = gameState.cameraShakeDuration;
    gameState.cameraShakeIntensity = shakeStrength;
  }

  function updateBallAnimation(deltaTime) {
    const squashAmount = 0.85;
    const stretchAmount = 1.5;

    switch (gameState.ballAnimationState) {
      case 'squashing': {
        gameState.ballAnimationTimer += deltaTime;
        const t = Math.min(gameState.ballAnimationTimer / gameState.squashDuration, 1);
        const ease = 1 - Math.pow(1 - t, 2);

        if (gameState.squashAxis === "x") {
          ball.scaling.x = BABYLON.Scalar.Lerp(1, squashAmount, ease);
          ball.scaling.y = BABYLON.Scalar.Lerp(1, stretchAmount, ease);
          ball.scaling.z = BABYLON.Scalar.Lerp(1, stretchAmount, ease);
        } else {
          ball.scaling.y = BABYLON.Scalar.Lerp(1, squashAmount, ease);
          ball.scaling.x = BABYLON.Scalar.Lerp(1, stretchAmount, ease);
          ball.scaling.z = BABYLON.Scalar.Lerp(1, stretchAmount, ease);
        }

        if (t >= 1) {
          gameState.ballAnimationState = 'stretching';
          gameState.ballAnimationTimer = 0;
        }
        break;
      }
      case 'stretching': {
        gameState.ballAnimationTimer += deltaTime;
        const t = Math.min(gameState.ballAnimationTimer / gameState.stretchDuration, 1);
        const ease = 1 - Math.pow(1 - t, 2);

        if (gameState.squashAxis === "x") {
          ball.scaling.x = BABYLON.Scalar.Lerp(squashAmount, 1, ease);
          ball.scaling.y = BABYLON.Scalar.Lerp(stretchAmount, 1, ease);
          ball.scaling.z = BABYLON.Scalar.Lerp(stretchAmount, 1, ease);
        } else {
          ball.scaling.y = BABYLON.Scalar.Lerp(squashAmount, 1, ease);
          ball.scaling.x = BABYLON.Scalar.Lerp(stretchAmount, 1, ease);
          ball.scaling.z = BABYLON.Scalar.Lerp(stretchAmount, 1, ease);
        }

        if (t >= 1) {
          gameState.ballAnimationState = 'normal';
          ball.scaling.set(1, 1, 1);
        }
        break;
      }
      case 'normal':
        ball.scaling.set(1, 1, 1);
        break;
    }
  }

  let lastTime = performance.now();
  engine.runRenderLoop(() => {
    const currentTime = performance.now();
    const deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    const sunTime = currentTime * 0.00008;
    const sunRadius = 20;
    const sunY = Math.sin(sunTime) * 8 + 8;
    const sunX = Math.cos(sunTime) * sunRadius;
    directionalLight.position = new BABYLON.Vector3(sunX, sunY, -20);
    directionalLight.direction = new BABYLON.Vector3(-sunX * 0.08, -sunY * 0.12, 1).normalize();

    updatePaddles();
    updateBall();
    updateBallAnimation(deltaTime);

    if (gameState.cameraShakeTime > 0) {
      gameState.cameraShakeTime -= deltaTime;
      const progress = gameState.cameraShakeTime / gameState.cameraShakeDuration;
      const intensity = gameState.cameraShakeIntensity * progress;
      const offsetX = (Math.random() - 0.5) * intensity;
      const offsetY = (Math.random() - 0.5) * intensity;
      const tilt = (Math.random() - 0.5) * intensity * 0.5;
      camera.position.x = offsetX;
      camera.position.y = offsetY;
      camera.rotation.z = tilt;
    } else {
      camera.position.x *= 0.85;
      camera.position.y *= 0.85;
      camera.rotation.z *= 0.85;
    }

    scene.render();
  });

  window.addEventListener("beforeunload", () => {
    engine.dispose();
  });
}

// Do NOT call startPongGame() automatically here!