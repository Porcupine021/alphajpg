/**
 * AlphaJpg allows one to load a specially crafted JPG file which contains both image and alpha channel data
 * and use it to reconstruct an image with semi-transparency. When working with photographic imagery that
 * requires transparency, typically PNG-24 is the only option with wide browser support. This library allows
 * for loading images with the bennefits of JPG compression AND alpha transparency. Internally, this library
 * reconstructs the original image using WebGL.
 * 
 * @author Aaron Graham
 */
var AlphaJpg_WebGL = (function(){

  var _supportsWebGL = null,
      _supportsToDataURL = null;

  /**
   * Tests whether the browser supports WebGL.
   * 
   * @private
   * @returns {bool}
   */
  var supportsWebGL = function(){
    if(_supportsWebGL !== null){
      return _supportsWebGL;
    }

    var canvas = document.createElement('CANVAS'),
        ctx = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    _supportsWebGL = !!(ctx && ctx instanceof WebGLRenderingContext);
    return _supportsWebGL;
  };

  /**
   * Tests whether the browser supports HTML5 canvas's toDataURL() method. Some old versions
   * of Android support canvas, but are are missing this functionality.
   * 
   * @private
   * @returns {bool} True if supported, otherwise false.
   */
  var supportsToDataURL = function(){
    if(_supportsToDataURL !== null){
      return _supportsToDataURL;
    }

    var canvas = document.createElement('CANVAS');
    canvas.width = canvas.height = 1;
    _supportsToDataURL = (typeof canvas.toDataURL === 'function' && canvas.toDataURL().indexOf('data:') === 0);
    return _supportsToDataURL;
  };

  /**
   * Tests whether the browser supports the technologies necessary to reconstruct the original image.
   * 
   * @public
   * @param {bool} testDataURI (Optional) Also test whether the browser can return the reconstructed 
   *   image as a base64 encoded string that could be used as an <img> src or css background-image. Default = false.
   * @returns {bool}
   */
  var isSupported = function(){
    var testDataURI = arguments.length > 0 ? !!arguments[0] : false;
    return (supportsWebGL() && (!testDataURI || (testDataURI && supportsToDataURL())));
  };

  /**
   * Creates an image with alpha transparency from a specially crafted JPG file containing both the source
   * image and an alpha transparency mask.
   * 
   * @public
   * @param {string} imgUrl The source image URL. Remember that domain policies apply to working with 
   *   images on canvas. The image may need to have appropriate CORS headers set or be served from the same 
   *   domain as your application.
   * @param {function} callback The callback function to be called once the finished image has been 
   *   reconstructed. The callback function will be passed a single argument which may be either boolean false
   *   (indicating an error has occurred), a <canvas> DOMElement, or a string data URI (if the returnDataURL 
   *   argument was set to true).
   * @param {bool} returnDataUrl (Optional) If true, the function will attempt to return the finished image
   *   as a base64 encoded data uri. Ex. "data:image/png;base64,iVBORw0K...truncated"
   * @return {void}
   */
  var load = function(imgUrl, callback){
    var returnDataURL = arguments.length > 2 ? !!arguments[2] : false,
        image;

    // bailout if the user didn't supply a valid callback, image URL, the browser doesn't support 
    // canvas or we are unable to return the canvas as the requested data uri string
    if(typeof imgUrl !== 'string' || typeof callback !== 'function' || !isSupported(returnDataURL)){
      callback(false);
      return;
    }

    image = new Image();

    image.onload = function(){
      reconstructViaWebGL(image, callback, returnDataURL);
    };

    image.onerror = function(){
      callback(false);
    };

    if(!isSameOrigin(imgUrl)){
      image.crossOrigin = '';
    }

    image.src = imgUrl;
  };

  /**
   * Tests whether a supplied URL shares the same origin (protocol and domain) as the current page.
   * 
   * @private
   * @param {string} url The URL to test
   * @returns {bool}
   */
  var isSameOrigin = function(url){
    var l = window.location;
    try{
      return ((new URL(url)).origin === l.origin);
    }
    catch(ex){
      var a = document.createElement('A'),
          urlOrigin, winOrigin;

      // attach an anchor tag to the document with the URL to test. this allows us to get access to the 
      // various pieces that comprise the URL
      a.href = url;
      document.head.appendChild(a);
      a.href = a.href; // relative URL's seem to need a refresh here to properly get the URL pieces in IE

      // create normalized origins by stripping off a port number and forcing to lower case
      urlOrigin = (a.protocol+'//'+a.host).replace(/:\d+/,'').toLowerCase();
      winOrigin = (l.protocol+'//'+l.host).replace(/:\d+/,'').toLowerCase();

      // clean up the anchor tag
      document.head.removeChild(a);

      return urlOrigin === winOrigin;
    }
  };

  /**
   * Reconstructs the image using canvas WebGL context.
   * 
   * @private
   * @param {object} img The source <img> DOM element
   * @param {function} callback Function to call after the image has been reconstructed.
   * @param {bool} returnDataURL
   * @returns {bool}
   */
  var reconstructViaWebGL = function(img, callback, returnDataURL){
    var canvas = document.createElement('CANVAS'),
        gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl'),
        w = img.naturalWidth,
        h = img.naturalHeight,
        h2 = Math.floor(h / 2),
        vertexShader, fragmentShader, program,
        posLocation, texLocation,
        posBuffer, texBuffer,
        vertexShaderSrc = ''+
          'attribute vec2 aPos;'+ // buffer array of vertex positions
          'attribute vec2 aTex;'+ // buffer array of texture coordinates
          'uniform vec2 uRes;'+ // the final image resolution
          'varying vec2 vTex;'+ // texture coordinates passed through to fragment shader
          'void main() {'+
            'vec2 clipSpace = (((aPos / uRes) * 2.0) - 1.0) * vec2(1, -1);'+ // convert rectangle from pixel space to clipspace (-1 to 1) and flip the y-axis
            'gl_Position = vec4(clipSpace, 0, 1);'+ // vertex shader must return vertex position
            'vTex = aTex;'+ // pass texture coordinates to fragment shader
          '}',
        fragmentShaderSrc = ''+
          'precision mediump float;'+
          'uniform sampler2D uImg;'+ // our source image texture
          'varying vec2 vTex;'+ // texture coordinates passed in from vertex shader
          'void main() {'+
            'vec4 img = texture2D(uImg, vTex);'+ // the RGBA pixel color from the image
            'vec4 mask = texture2D(uImg, vec2(vTex.x, vTex.y + 0.5));'+ // the RGBA pixel color from the mask
            'vec4 o = vec4(img.r * mask.r, img.g * mask.r, img.b * mask.r, mask.r);'+ // reconstruct the original color values
            'gl_FragColor = vec4(o.rgb / o.a, o.a);'+ // by default WebGL uses pre-multipled alpha values, so adjust for it
          '}'
      ;

    canvas.width = w;
    canvas.height = h2;

    // compile the vertex shader
    vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, vertexShaderSrc);
    gl.compileShader(vertexShader);
    if(!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)){
      console.error(gl.getShaderInfoLog(vertexShader));
      gl.deleteShader(vertexShader);
      return false;
    }

    // compile the fragment shader
    fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, fragmentShaderSrc);
    gl.compileShader(fragmentShader);
    if(!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)){
      console.error(gl.getShaderInfoLog(fragmentShader));
      gl.deleteShader(fragmentShader);
      return false;
    }

    // link the shaders and create the program to run on the GPU
    program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if(!gl.getProgramParameter(program, gl.LINK_STATUS)){
      console.error(gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return false;
    }

    // create a vertex position buffer that contains 6 x,y coordinate pairs. two triangles that form
    // a rectangle the same size as the image. bind vertex position data to the shader and tell it to 
    // pull values from it as pairs of floats
    posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, w, 0, 0, h, 0, h, w, 0, w, h]), gl.STATIC_DRAW);
    posLocation = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(posLocation);
    gl.vertexAttribPointer(posLocation, 2, gl.FLOAT, false, 0, 0);

    // create texture coordinates for the rectangle, bind it to the shader and tell it to pull
    // values as pairs of floats
    texBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
    texLocation = gl.getAttribLocation(program, "aTex");
    gl.enableVertexAttribArray(texLocation);
    gl.vertexAttribPointer(texLocation, 2, gl.FLOAT, false, 0, 0);

    // create the texture and allow it to be any size (not just powers of 2)
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);

    // set viewport size and tell WebGL to use our shaders program
    gl.viewport(0, 0, w, h2);
    gl.useProgram(program);

    // tell the shaders the size of the canvas
    gl.uniform2f(gl.getUniformLocation(program, "uRes"), w, h2);

    // draw the rectangle (2 triangles, 6 verticies)
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    callback(returnDataURL ? canvas.toDataURL() : canvas);

    return true;
  };

  // expose public methods
  return {
    isSupported: isSupported,
    load: load
  };
})();