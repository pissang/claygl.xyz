clay.Shader.import(`@export clay.ground.vertex
@import clay.lambert.vertex
@end


@export clay.ground.fragment

varying vec2 v_Texcoord;
varying vec3 v_Normal;
varying vec3 v_WorldPosition;

uniform vec4 color : [1.0, 1.0, 1.0, 1.0];
uniform float gridSize: 5;
uniform float gridSize2: 1;
uniform vec4 gridColor: [0, 0, 0, 1];
uniform vec4 gridColor2: [0.2, 0.2, 0.2, 1];

uniform float glossiness: 0.7;

#ifdef SSAOMAP_ENABLED
// For ssao prepass
uniform sampler2D ssaoMap;
uniform vec4 viewport : VIEWPORT;
#endif

#ifdef AMBIENT_LIGHT_COUNT
@import clay.header.ambient_light
#endif
#ifdef AMBIENT_SH_LIGHT_COUNT
@import clay.header.ambient_sh_light
#endif
#ifdef DIRECTIONAL_LIGHT_COUNT
@import clay.header.directional_light
#endif

@import clay.plugin.compute_shadow_map

void main()
{
    gl_FragColor = color;

    float wx = v_WorldPosition.x;
    float wz = v_WorldPosition.z;
    float x0 = abs(fract(wx / gridSize - 0.5) - 0.5) / fwidth(wx) * gridSize / 2.0;
    float z0 = abs(fract(wz / gridSize - 0.5) - 0.5) / fwidth(wz) * gridSize / 2.0;

    float x1 = abs(fract(wx / gridSize2 - 0.5) - 0.5) / fwidth(wx) * gridSize2 / 2.0;
    float z1 = abs(fract(wz / gridSize2 - 0.5) - 0.5) / fwidth(wz) * gridSize2 / 2.0;

    float v0 = 1.0 - clamp(min(x0, z0), 0.0, 1.0);
    float v1 = 1.0 - clamp(min(x1, z1), 0.0, 1.0);
    if (v0 > 0.1) {
        gl_FragColor = mix(gl_FragColor, gridColor, v0);
    }
    else {
        gl_FragColor = mix(gl_FragColor, gridColor2, v1);
    }

    vec3 diffuseColor = vec3(0.0, 0.0, 0.0);

#ifdef AMBIENT_LIGHT_COUNT
    for(int _idx_ = 0; _idx_ < AMBIENT_LIGHT_COUNT; _idx_++)
    {
        diffuseColor += ambientLightColor[_idx_];
    }
#endif
#ifdef AMBIENT_SH_LIGHT_COUNT
    for(int _idx_ = 0; _idx_ < AMBIENT_SH_LIGHT_COUNT; _idx_++)
    {{
        diffuseColor += calcAmbientSHLight(_idx_, v_Normal) * ambientSHLightColor[_idx_];
    }}
#endif

#ifdef DIRECTIONAL_LIGHT_COUNT
#if defined(DIRECTIONAL_LIGHT_SHADOWMAP_COUNT)
    float shadowContribsDir[DIRECTIONAL_LIGHT_COUNT];
    if(shadowEnabled)
    {
        computeShadowOfDirectionalLights(v_WorldPosition, shadowContribsDir);
    }
#endif
    for(int i = 0; i < DIRECTIONAL_LIGHT_COUNT; i++)
    {
        vec3 lightDirection = -directionalLightDirection[i];
        vec3 lightColor = directionalLightColor[i];

        float ndl = dot(v_Normal, normalize(lightDirection));

        float shadowContrib = 1.0;
#if defined(DIRECTIONAL_LIGHT_SHADOWMAP_COUNT)
        if( shadowEnabled )
        {
            shadowContrib = shadowContribsDir[i];
        }
#endif

        diffuseColor += lightColor * clamp(ndl, 0.0, 1.0) * shadowContrib;
    }
#endif

#ifdef SSAOMAP_ENABLED
    diffuseColor *= texture2D(ssaoMap, (gl_FragCoord.xy - viewport.xy) / viewport.zw).r;
#endif

    gl_FragColor.rgb *= diffuseColor;

    gl_FragColor.a *= 1.0 - clamp(length(v_WorldPosition.xz) / 40.0, 0.0, 1.0);

}

@end
`);

/// Init background
var app = clay.application.create('#background', {

    // autoRender: false,

    graphic: {
        tonemapping: true,
        linear: true,
        shadow: true
    },

    event: true,

    init: function (app) {

        // var adv = this._adv = new ClayAdvancedRenderer(app.renderer, app.scene, app.timeline, {
        //     shadow: {
        //         enable: true
        //     },
        //     temporalSuperSampling: {
        //         enable: true
        //     },
        //     postEffect: {
        //         enable: true
        //     }
        // });

        // Create camera
        this._cameraRoot = app.createNode();
        this._cameraRoot.add(app.createCamera([0, 3, app.width > app.height ? 15 : 25], [0, 2, 0]));


        // Create light
        app.createDirectionalLight([-1, -3, -1], '#fff', 2);
        app.scene.add(new clay.light.AmbientSH({
            intensity: 0.4,
            coefficients: [0.844, 0.712, 0.691, -0.037, 0.083, 0.167, 0.343, 0.288, 0.299, -0.041, -0.021, -0.009, -0.003, -0.041, -0.064, -0.011, -0.007, -0.004, -0.031, 0.034, 0.081, -0.060, -0.049, -0.060, 0.046, 0.056, 0.050]
        }));

        var control = new clay.plugin.OrbitControl({
            domElement: app.container,
            target: this._cameraRoot,
            timeline: app.timeline
        });

        // console.error('Failed to use camera');
        window.addEventListener('deviceorientation', function (e) {
            control.setAlpha(-(e.beta - 80) / 2);
            control.setBeta(e.gamma / 2);
        });

        app.container.addEventListener('mousemove', (e) => {
            control.setBeta(-(e.clientX - window.innerWidth / 2) / window.innerWidth * 60);
            control.setAlpha((e.clientY - window.innerHeight / 2) / window.innerHeight * 30);
        });

        this._initGround(app);

        return app.loadModel('./assets/logo/logo.gltf').then((result) => {
            this._logoRoot = result.rootNode;
            this._alphaBetaMesh = result.meshes[0];

            this._logoRoot.on('click', this._clickToJump.bind(this, app));
        });
    },

    _clickToJump: function (app, event) {
        var props = {
            y: 0,
            sx: 1,
            sy: 1
        };
        var mesh = this._logoRoot;

        app.timeline.animate(props)
            .then(300, {
                y: 0, sx: 1.1, sy: 0.9
            }, 'circularOut')
            .then(100, {
                y: 0, sx: 1.1, sy: 0.9
            })
            .then(300, {
                y: 0, sx: 1, sy: 1
            }, 'circularIn')
            .then(500, {
                y: 3, sx: 0.9, sy: 1.1
            }, 'circularOut')
            .then(500, {
                y: 0, sx: 1, sy: 1
            }, 'bounceOut')
            // .then(200, {
            //     y: 0, sx: 1.1, sy: 0.9
            // }, 'circularOut')
            // .then(200, {
            //     // Must have all properties in last frame!
            //     y: 0, sx: 1, sy: 1
            // }, 'circularIn')
            .during(function () {
                mesh.position.y = props.y;
                mesh.scale.set(props.sx, props.sy, props.sx);
            })
            .start();

    },

    _initGround: function (app) {
        var ground = app.createPlane({
            shader: new clay.Shader(clay.Shader.source('clay.ground.vertex'), clay.Shader.source('clay.ground.fragment'))
        });
        ground.castShadow = false;
        ground.rotation.rotateX(-Math.PI / 2);
        ground.scale.set(50, 50, 1);
    },

    loop: function () {
        // this._adv.render();
    }
});

window.onresize = function () {
    app.resize();
}