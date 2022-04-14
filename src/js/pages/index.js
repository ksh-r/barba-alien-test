// Loaders
import { EnvironmentTextureLoader } from "../../3d/loaders/world/EnvironmentTextureLoader";
import { TextureLoader } from "../../3d/loaders/world/TextureLoader";
// Tween
import { ticker } from "../../3d/tween/Ticker";
import { tween } from "../../3d/tween/Tween";
// Utils
import { mix } from "../../3d/utils/Utils";
import { radians } from "../../3d/utils/Utils";
// 3D
import { getFullscreenTriangle } from "../../3d/utils/world/Utils3D";
import { getFrustum } from "../../3d/utils/world/Utils3D";
// Materials
import { BloomCompositeMaterial } from "../../3d/materials/BloomCompositeMaterial";
import { FXAAMaterial } from "../../3d/materials/FXAAMaterial";
import { LuminosityMaterial } from "../../3d/materials/LuminosityMaterial";
import { UnrealBloomBlurMaterial } from "../../3d/materials/UnrealBloomBlurMaterial";
// Three.js
import { ACESFilmicToneMapping, AmbientLight, BufferGeometryLoader, BufferGeometryLoaderThread, Color, GLSL3, Group, HemisphereLight, ImageBitmapLoaderThread, MathUtils, Mesh, MeshBasicMaterial, MeshStandardMaterial, NoBlending, OrthographicCamera, PerspectiveCamera, PointLight, RGBFormat, RawShaderMaterial, RepeatWrapping, Scene, ShaderChunk, SphereGeometry, Thread, Uniform, Vector2, Vector3, WebGLRenderer, WebGLRenderTarget } from "three";

class Config {
    static BG_COLOR = '#0e0e0e';
    static UI_COLOR = 'rgba(255, 255, 255, 0.94)';

    static DEBUG = location.search === '?debug';
}

import rgbshift from '../../3d/shaders/modules/rgbshift/rgbshift.glsl.js';

const vertexCompositeShader = /* glsl */`
            in vec3 position;
            in vec2 uv;

            out vec2 vUv;

            void main() {
                vUv = uv;

                gl_Position = vec4(position, 1.0);
            }
        `;

const fragmentCompositeShader = /* glsl */`
            precision highp float;

            uniform sampler2D tScene;
            uniform sampler2D tBloom;
            uniform float uDistortion;

            in vec2 vUv;

            out vec4 FragColor;

            ${rgbshift}

            void main() {
                FragColor = texture(tScene, vUv);

                float angle = length(vUv - 0.5);
                float amount = 0.0002 + uDistortion;

                FragColor.rgb += getRGB(tBloom, vUv, angle, amount).rgb;
            }
        `;

class CompositeMaterial extends RawShaderMaterial {
    constructor() {
        super({
            glslVersion: GLSL3,
            uniforms: {
                tScene: new Uniform(null),
                tBloom: new Uniform(null),
                uDistortion: new Uniform(0.00125)
            },
            vertexShader: vertexCompositeShader,
            fragmentShader: fragmentCompositeShader,
            blending: NoBlending,
            depthWrite: false,
            depthTest: false
        });
    }
}

class MouseLight extends Group {
    constructor() {
        super();

        this.position.z = -1.5;

        if (Config.DEBUG) {
            this.initDebug();
        }

        this.initLight();
    }

    initDebug() {
        const geometry = new SphereGeometry(0.125, 1, 1);

        const material = new MeshBasicMaterial({
            color: 0xff0000,
            wireframe: true
        });

        const mesh = new Mesh(geometry, material);
        this.add(mesh);
    }

    initLight() {
        const light = new PointLight(0x7f4c00, 0.2);
        this.add(light);
    }
}

class Polyhedron extends Group {
    constructor() {
        super();
    }

    async initGeometry() {
        const { loadBufferGeometry } = WorldController;

        const geometry = await loadBufferGeometry('./geometry/polyhedron.json');

        // 2nd set of UV's for aoMap and lightMap
        geometry.attributes.uv2 = geometry.attributes.uv;

        this.geometry = geometry;
    }

    async initMaterial() {
        const { anisotropy, loadTexture, loadEnvironmentTexture } = WorldController;

        // Textures
        const [map, normalMap, ormMap, thicknessMap, envMap] = await Promise.all([
            // loadTexture('assets/textures/uv.jpg'),
            loadTexture('./textures/pbr/pitted_metal_basecolor.jpg'),
            loadTexture('./textures/pbr/pitted_metal_normal.jpg'),
            // https://occlusion-roughness-metalness.glitch.me/
            loadTexture('./textures/pbr/pitted_metal_orm.jpg'),
            loadTexture('./textures/pbr/pitted_metal_height.jpg'),
            loadEnvironmentTexture('./textures/env.jpg')
        ]);

        map.anisotropy = anisotropy;
        map.wrapS = RepeatWrapping;
        map.wrapT = RepeatWrapping;
        map.repeat.set(2, 1);

        normalMap.anisotropy = anisotropy;
        normalMap.wrapS = RepeatWrapping;
        normalMap.wrapT = RepeatWrapping;
        normalMap.repeat.set(2, 1);

        ormMap.anisotropy = anisotropy;
        ormMap.wrapS = RepeatWrapping;
        ormMap.wrapT = RepeatWrapping;
        ormMap.repeat.set(2, 1);

        thicknessMap.anisotropy = anisotropy;
        thicknessMap.wrapS = RepeatWrapping;
        thicknessMap.wrapT = RepeatWrapping;
        thicknessMap.repeat.set(2, 1);

        const material = new MeshStandardMaterial({
            roughness: 3,
            metalness: 0.6,
            map,
            aoMap: ormMap,
            aoMapIntensity: 1,
            roughnessMap: ormMap,
            metalnessMap: ormMap,
            normalMap,
            normalScale: new Vector2(3, 3),
            envMap,
            envMapIntensity: 1,
            flatShading: true
        });

        // Based on {@link module:three/examples/jsm/shaders/SubsurfaceScatteringShader.js} by daoshengmu

        material.onBeforeCompile = shader => {
            shader.uniforms.thicknessMap = new Uniform(thicknessMap);
            shader.uniforms.thicknessDistortion = new Uniform(0.185);
            shader.uniforms.thicknessAmbient = new Uniform(0);
            shader.uniforms.thicknessAttenuation = new Uniform(1);
            shader.uniforms.thicknessPower = new Uniform(20);
            shader.uniforms.thicknessScale = new Uniform(4);

            shader.fragmentShader = shader.fragmentShader.replace(
                'void main() {',
                        /* glsl */`
                        uniform sampler2D thicknessMap;
                        uniform float thicknessDistortion;
                        uniform float thicknessAmbient;
                        uniform float thicknessAttenuation;
                        uniform float thicknessPower;
                        uniform float thicknessScale;

                        void RE_Direct_Scattering(const in IncidentLight directLight, const in vec2 uv, const in GeometricContext geometry, inout ReflectedLight reflectedLight) {
                            vec3 thickness = directLight.color * texture(thicknessMap, uv).g;
                            vec3 scatteringHalf = normalize(directLight.direction + (geometry.normal * thicknessDistortion));
                            float scatteringDot = pow(saturate(dot(geometry.viewDir, -scatteringHalf)), thicknessPower) * thicknessScale;
                            vec3 scatteringIllu = (scatteringDot + thicknessAmbient) * thickness;
                            reflectedLight.directDiffuse += scatteringIllu * thicknessAttenuation * directLight.color;
                        }

                        void main() {
                        `
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <lights_fragment_begin>',
                ShaderChunk['lights_fragment_begin'].replaceAll(
                    'RE_Direct( directLight, geometry, material, reflectedLight );',
                            /* glsl */`
                            RE_Direct( directLight, geometry, material, reflectedLight );
                            RE_Direct_Scattering(directLight, vUv, geometry, reflectedLight);
                            `
                )
            );
        };

        this.material = material;
    }

    initMesh() {
        this.mesh = new Mesh(this.geometry, this.material);
        this.add(this.mesh);
    }

    /**
     * Public methods
     */

    ready = async () => {
        await Promise.all([
            this.initGeometry(),
            this.initMaterial()
        ]);

        this.initMesh();
    };
}

class SceneView extends Group {
    constructor() {
        super();

        this.visible = false;

        this.initViews();
    }

    initViews() {
        this.polyhedron = new Polyhedron();
        this.add(this.polyhedron);

        this.light = new MouseLight();
        this.add(this.light);
    }
}

class SceneController {
    static init(view) {
        this.view = view;

        this.mouse = new Vector2();
        this.target = new Vector2();
        this.lightPosition = new Vector3();
        this.lerpSpeed = 0.25;

        this.addListeners();
    }

    static addListeners() {
        window.addEventListener('pointerdown', this.onPointerDown);
        window.addEventListener('pointermove', this.onPointerMove);
        window.addEventListener('pointerup', this.onPointerUp);
    }

    /**
     * Event handlers
     */

    static onPointerDown = e => {
        this.onPointerMove(e);
    };

    static onPointerMove = ({ clientX, clientY }) => {
        if (!this.view.visible) {
            return;
        }

        this.target.x = (clientX / window.innerWidth) * 2 - 1;
        this.target.y = 1 - (clientY / window.innerHeight) * 2;
    };

    static onPointerUp = e => {
        this.onPointerMove(e);
    };

    /**
     * Public methods
     */

    static resize = () => {
        const { width, height } = WorldController.getFrustum(this.view.light.position.z);

        this.halfWidth = width / 2;
        this.halfHeight = height / 2;
    };

    static update = () => {
        if (!this.view.visible) {
            return;
        }

        this.mouse.lerp(this.target, this.lerpSpeed);

        this.lightPosition.x = this.mouse.x * this.halfWidth;
        this.lightPosition.y = this.mouse.y * this.halfHeight;
        this.lightPosition.z = this.view.light.position.z;

        this.view.light.position.copy(this.lightPosition);
    };

    static animateIn = () => {
        this.view.visible = true;
    };

    static ready = () => this.view.polyhedron.ready();
}

const BlurDirectionX = new Vector2(1, 0);
const BlurDirectionY = new Vector2(0, 1);

class RenderManager {
    static init(renderer, scene, camera) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;

        this.luminosityThreshold = 0.1;
        this.bloomStrength = 0.3;
        this.bloomRadius = 0.75;
        this.enabled = true;

        this.initRenderer();
    }

    static initRenderer() {
        const { screenTriangle, resolution } = WorldController;

        // Fullscreen triangle
        this.screenScene = new Scene();
        this.screenCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

        this.screen = new Mesh(screenTriangle);
        this.screen.frustumCulled = false;
        this.screenScene.add(this.screen);

        // Render targets
        this.renderTargetA = new WebGLRenderTarget(1, 1, {
            format: RGBFormat,
            depthBuffer: false
        });

        this.renderTargetB = this.renderTargetA.clone();

        this.renderTargetsHorizontal = [];
        this.renderTargetsVertical = [];
        this.nMips = 5;

        this.renderTargetBright = this.renderTargetA.clone();

        for (let i = 0, l = this.nMips; i < l; i++) {
            this.renderTargetsHorizontal.push(this.renderTargetA.clone());
            this.renderTargetsVertical.push(this.renderTargetA.clone());
        }

        this.renderTargetA.depthBuffer = true;

        // FXAA material
        this.fxaaMaterial = new FXAAMaterial();
        this.fxaaMaterial.uniforms.uResolution = resolution;

        // Luminosity high pass material
        this.luminosityMaterial = new LuminosityMaterial();
        this.luminosityMaterial.uniforms.uLuminosityThreshold.value = this.luminosityThreshold;

        // Gaussian blur materials
        this.blurMaterials = [];

        const kernelSizeArray = [3, 5, 7, 9, 11];

        for (let i = 0, l = this.nMips; i < l; i++) {
            this.blurMaterials.push(new UnrealBloomBlurMaterial(kernelSizeArray[i]));
            this.blurMaterials[i].uniforms.uResolution.value = new Vector2();
        }

        // Bloom composite material
        const bloomFactors = [1, 0.8, 0.6, 0.4, 0.2];

        for (let i = 0, l = this.nMips; i < l; i++) {
            const factor = bloomFactors[i];
            bloomFactors[i] = this.bloomStrength * mix(factor, 1.2 - factor, this.bloomRadius);
        }

        this.bloomCompositeMaterial = new BloomCompositeMaterial(this.nMips);
        this.bloomCompositeMaterial.uniforms.tBlur1.value = this.renderTargetsVertical[0].texture;
        this.bloomCompositeMaterial.uniforms.tBlur2.value = this.renderTargetsVertical[1].texture;
        this.bloomCompositeMaterial.uniforms.tBlur3.value = this.renderTargetsVertical[2].texture;
        this.bloomCompositeMaterial.uniforms.tBlur4.value = this.renderTargetsVertical[3].texture;
        this.bloomCompositeMaterial.uniforms.tBlur5.value = this.renderTargetsVertical[4].texture;
        this.bloomCompositeMaterial.uniforms.uBloomFactors.value = bloomFactors;

        // Composite material
        this.compositeMaterial = new CompositeMaterial();
    }

    /**
     * Public methods
     */

    static resize = (width, height, dpr) => {
        this.renderer.setPixelRatio(dpr);
        this.renderer.setSize(width, height);

        width = Math.round(width * dpr);
        height = Math.round(height * dpr);

        this.renderTargetA.setSize(width, height);
        this.renderTargetB.setSize(width, height);

        width = MathUtils.floorPowerOfTwo(width) / 2;
        height = MathUtils.floorPowerOfTwo(height) / 2;

        this.renderTargetBright.setSize(width, height);

        for (let i = 0, l = this.nMips; i < l; i++) {
            this.renderTargetsHorizontal[i].setSize(width, height);
            this.renderTargetsVertical[i].setSize(width, height);

            this.blurMaterials[i].uniforms.uResolution.value.set(width, height);

            width = width / 2;
            height = height / 2;
        }
    };

    static update = () => {
        const renderer = this.renderer;
        const scene = this.scene;
        const camera = this.camera;

        if (!this.enabled) {
            renderer.setRenderTarget(null);
            renderer.render(scene, camera);
            return;
        }

        const screenScene = this.screenScene;
        const screenCamera = this.screenCamera;

        const renderTargetA = this.renderTargetA;
        const renderTargetB = this.renderTargetB;
        const renderTargetBright = this.renderTargetBright;
        const renderTargetsHorizontal = this.renderTargetsHorizontal;
        const renderTargetsVertical = this.renderTargetsVertical;

        // Scene pass
        renderer.setRenderTarget(renderTargetA);
        renderer.render(scene, camera);

        // FXAA pass
        this.fxaaMaterial.uniforms.tMap.value = renderTargetA.texture;
        this.screen.material = this.fxaaMaterial;
        renderer.setRenderTarget(renderTargetB);
        renderer.render(screenScene, screenCamera);

        // Extract bright areas
        this.luminosityMaterial.uniforms.tMap.value = renderTargetB.texture;
        this.screen.material = this.luminosityMaterial;
        renderer.setRenderTarget(renderTargetBright);
        renderer.render(screenScene, screenCamera);

        // Blur all the mips progressively
        let inputRenderTarget = renderTargetBright;

        for (let i = 0, l = this.nMips; i < l; i++) {
            this.screen.material = this.blurMaterials[i];

            this.blurMaterials[i].uniforms.tMap.value = inputRenderTarget.texture;
            this.blurMaterials[i].uniforms.uDirection.value = BlurDirectionX;
            renderer.setRenderTarget(renderTargetsHorizontal[i]);
            renderer.render(screenScene, screenCamera);

            this.blurMaterials[i].uniforms.tMap.value = this.renderTargetsHorizontal[i].texture;
            this.blurMaterials[i].uniforms.uDirection.value = BlurDirectionY;
            renderer.setRenderTarget(renderTargetsVertical[i]);
            renderer.render(screenScene, screenCamera);

            inputRenderTarget = renderTargetsVertical[i];
        }

        // Composite all the mips
        this.screen.material = this.bloomCompositeMaterial;
        renderer.setRenderTarget(renderTargetsHorizontal[0]);
        renderer.render(screenScene, screenCamera);

        // Composite pass (render to screen)
        this.compositeMaterial.uniforms.tScene.value = renderTargetB.texture;
        this.compositeMaterial.uniforms.tBloom.value = renderTargetsHorizontal[0].texture;
        this.screen.material = this.compositeMaterial;
        renderer.setRenderTarget(null);
        renderer.render(screenScene, screenCamera);
    };
}

class CameraController {
    static init(camera) {
        this.camera = camera;

        this.mouse = new Vector2();
        this.target = new Vector2();

        // Motion control
        this.group = new Group();
        this.innerGroup = new Group();
        this.group.add(this.innerGroup);
        this.group.matrixAutoUpdate = false;
        this.innerGroup.matrixAutoUpdate = false;

        // Start position
        this.innerGroup.position.copy(this.camera.position);

        this.rotation = 0.0002;
        this.lerpSpeed = 0.05;
        this.multiplier = 1;
        this.enabled = false;
        this.prevent = true;

        this.addListeners();
    }

    static addListeners() {
        window.addEventListener('pointerdown', this.onPointerDown);
        window.addEventListener('pointermove', this.onPointerMove);
        window.addEventListener('pointerup', this.onPointerUp);
    }

    /**
     * Event handlers
     */

    static onPointerDown = e => {
        this.onPointerMove(e);
    };

    static onPointerMove = ({ clientX, clientY }) => {
        if (this.prevent) {
            return;
        }

        this.mouse.x = (clientX - this.halfWidth);
        this.mouse.y = (clientY - this.halfHeight);

        this.target.x = radians(-360) + (1 - this.mouse.x) * this.rotation * this.multiplier;
        this.target.y = (1 - this.mouse.y) * this.rotation * this.multiplier;
    };

    static onPointerUp = e => {
        this.onPointerMove(e);
    };

    /**
     * Public methods
     */

    static resize = (width, height) => {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.halfWidth = width / 2;
        this.halfHeight = height / 2;

        if (width < height) {
            this.camera.position.z = 10;
            this.multiplier = 2;
        } else {
            this.camera.position.z = 8;
            this.multiplier = 1;
        }

        this.innerGroup.position.z = this.camera.position.z;
    };

    static update = () => {
        if (!this.enabled) {
            return;
        }

        this.group.rotation.x += (this.target.y - this.group.rotation.x) * this.lerpSpeed;
        this.group.rotation.y += (this.target.x - this.group.rotation.y) * this.lerpSpeed;

        this.updateCamera();
    };

    static updateCamera = () => {
        this.group.updateMatrix();
        this.innerGroup.updateMatrix();
        this.group.updateMatrixWorld();
        this.innerGroup.matrixWorld.decompose(this.camera.position, this.camera.quaternion, this.camera.scale);
    };

    static animateIn = () => {
        this.enabled = true;

        tween(this.target, { x: radians(-360) }, 4200, 'easeInOutQuart', () => {
            this.prevent = false;
        });
    };
}

class WorldController {
    static init() {
        this.initWorld();
        this.initLights();
        this.initLoaders();

        this.addListeners();
    }

    static initWorld() {
        this.renderer = new WebGLRenderer({
            powerPreference: 'high-performance',
            stencil: false
        });
        this.element = this.renderer.domElement;

        // Tone mapping
        this.renderer.toneMapping = ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1;

        // 3D scene
        this.scene = new Scene();
        this.scene.background = new Color(Config.BG_COLOR);
        this.camera = new PerspectiveCamera(30);
        this.camera.near = 0.5;
        this.camera.far = 50;
        this.camera.position.z = 8;
        this.camera.lookAt(this.scene.position);

        // Global geometries
        this.screenTriangle = getFullscreenTriangle();

        // Global uniforms
        this.resolution = new Uniform(new Vector2());
        this.aspect = new Uniform(1);
        this.time = new Uniform(0);
        this.frame = new Uniform(0);

        // Global settings
        this.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    }

    static initLights() {
        this.scene.add(new AmbientLight(0xffffff, 0.2));

        this.scene.add(new HemisphereLight(0x606060, 0x404040));
    }

    static initLoaders() {
        this.textureLoader = new TextureLoader();
        this.environmentLoader = new EnvironmentTextureLoader(this.renderer);
        this.bufferGeometryLoader = new BufferGeometryLoader();
    }

    static addListeners() {
        this.renderer.domElement.addEventListener('touchstart', this.onTouchStart);
    }

    /**
     * Event handlers
     */

    static onTouchStart = e => {
        e.preventDefault();
    };

    /**
     * Public methods
     */

    static resize = (width, height, dpr) => {
        width = Math.round(width * dpr);
        height = Math.round(height * dpr);

        this.resolution.value.set(width, height);
        this.aspect.value = width / height;
    };

    static update = (time, delta, frame) => {
        this.time.value = time;
        this.frame.value = frame;
    };

    static getTexture = (path, callback) => this.textureLoader.load(path, callback);

    static loadTexture = path => this.textureLoader.loadAsync(path);

    static getEnvironmentTexture = (path, callback) => this.environmentLoader.load(path, callback);

    static loadEnvironmentTexture = path => this.environmentLoader.loadAsync(path);

    static getBufferGeometry = (path, callback) => this.bufferGeometryLoader.load(path, callback);

    static loadBufferGeometry = path => this.bufferGeometryLoader.loadAsync(path);

    static getFrustum = offsetZ => getFrustum(this.camera, offsetZ);
}

class App {
    static async init() {
        // CHANGES - commented 3l
        // if (!Device.agent.includes('firefox')) {
        //     this.initThread();
        // }

        this.initWorld();
        this.initViews();
        this.initControllers();

        await SceneController.ready();

    }

    static initThread() {
        ImageBitmapLoaderThread.init();
        BufferGeometryLoaderThread.init();

        Thread.shared();
    }

    static initWorld() {
        WorldController.init();
    }

    static initViews() {
        this.view = new SceneView();
        WorldController.scene.add(this.view);
    }

    static initControllers() {
        const { renderer, scene, camera } = WorldController;

        CameraController.init(camera);
        SceneController.init(this.view);
        RenderManager.init(renderer, scene, camera);
    }

    static addListeners() {
        window.addEventListener('resize', this.onResize);
        ticker.add(this.onUpdate);
    }

    static removeListeners() {
        window.removeEventListener('resize', this.onResize);
        ticker.remove(this.onUpdate);
    }

    /**
     * Event handlers
     */

    static onResize = () => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const dpr = window.devicePixelRatio;

        WorldController.resize(width, height, dpr);
        CameraController.resize(width, height);
        SceneController.resize();
        RenderManager.resize(width, height, dpr);
    };

    static onUpdate = (time, delta, frame) => {
        WorldController.update(time, delta, frame);
        CameraController.update(time);
        SceneController.update();
        RenderManager.update(time, delta, frame);
    };

    static animateIn = () => {
        console.log('animateIn');
        this.addListeners();
        this.onResize();

        CameraController.animateIn();
        SceneController.animateIn();
    };

    static animateOut = () => {
        console.log('animateOut');
        this.removeListeners();
    };
}

App.init();

class Index {
    namespace = 'index';

    beforeEnter = data => {
        console.log('Index beforeEnter view')
        document.getElementById('root').appendChild(WorldController.element);
        App.animateIn();
    }
    afterEnter = data => {
        console.log('Index afterEnter view')
    }
    beforeLeave = data => {
        console.log('Index beforeLeave view')
        App.animateOut();
    }
    afterLeave = data => {
        console.log('Index afterLeave view')
    }
}

export default new Index();