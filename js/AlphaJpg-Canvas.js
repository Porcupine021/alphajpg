/**
 * AlphaJpg allows one to load a specially crafted JPG file which contains both image and alpha channel data
 * and use it to reconstruct an image with semi-transparency. When working with photographic imagery that
 * requires transparency, typically PNG-24 is the only option with wide browser support. This library allows
 * for loading images with the bennefits of JPG compression AND alpha transparency. Internally, this library
 * reconstructs the original image using HTML5 canvas (2D).
 * 
 * @author Aaron Graham
 */
var AlphaJpg_Canvas = (function(){

  var _supportsCanvas = null,
      _supportsToDataURL = null,
      _isIE9 = null,
      _useCreateImageBitmap = null;

  /**
   * Tests whether the browser supports HTML5 canvas.
   * 
   * @private
   * @returns {bool}
   */
  var supportsCanvas = function(){
    if(_supportsCanvas !== null){
      return _supportsCanvas;
    }

    var canvas = document.createElement('CANVAS');
    _supportsCanvas = !!(canvas.getContext && canvas.getContext('2d'));
    return _supportsCanvas;
  };

  /**
   * Tests whether the browser supports HTML5 canvas's toDataURL() method. Some old versions
   * of Android support canvas, but are are missing this functionality. Note that it can be polyfilled.
   * 
   * @private
   * @returns {bool}
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
   * Tests whether the current browser is Internet Explorer 9
   * 
   * @private
   * @returns {bool}
   */
  var isIE9 = function(){
    if(_isIE9 !== null){
      return _isIE9;
    }

    var av = navigator.appVersion;
    _isIE9 = (av.indexOf("MSIE") !== -1 && parseFloat(av.split("MSIE")[1]) <= 9);
    return _isIE9;
  };

  /**
   * Tests whether a the device is Android and supports the createImageBitmap() function.
   * There is a very weird bug where chrome on android 6+ will significantly darken pixels drawn to canvas.
   * 
   * @private
   * @see https://stackoverflow.com/questions/43515988/putimagedata-is-darkening-the-image
   * @returns {bool}
   */
  var useCreateImageBitmap = function(){
    if(_useCreateImageBitmap !== null){
      return _useCreateImageBitmap;
    }

    _useCreateImageBitmap = (!!navigator.userAgent.match(/(Android)/ig) && typeof window.createImageBitmap === 'function');
    return _useCreateImageBitmap;
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
    return (supportsCanvas() && (!testDataURI || (testDataURI && supportsToDataURL())));
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
    if(typeof imgUrl !== 'string' || typeof callback !== 'function' || !isSupported(returnDataURL)){
      callback(false);
      return;
    }

    image = new Image();

    image.onload = function(){
      // IE9 needs a breather before it will reliably get the contents of the image to paint to the canvas
      if(isIE9()){
        setTimeout(function(){ reconstructViaCanvas2D(image, callback, returnDataURL); }, 300);
      }
      else{
        reconstructViaCanvas2D(image, callback, returnDataURL);
      }
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
   * Reconstructs the image using canvas 2D context.
   * 
   * @private
   * @param {object} img The source <img> DOM element
   * @param {function} callback Function to call after the image has been reconstructed.
   * @param {bool} returnDataURL
   * @returns {void}
   */
  var reconstructViaCanvas2D = function(img, callback, returnDataURL){
    var canvas = document.createElement('CANVAS'),
        ctx = canvas.getContext('2d'),
        w = img.naturalWidth,
        h = img.naturalHeight,
        i, j, len, pixels, alpha, normalizedAlpha;

    canvas.width = w;
    canvas.height = h;

    // draw the special masked image to the canvas
    ctx.drawImage(img, 0, 0, w, h); 

    // get raw pixel data for the image
    pixels = ctx.getImageData(0, 0, w, h);

    // the bottom half of the image (the mask) is no longer needed, so resize the height to discard it
    canvas.height = Math.floor(h / 2);

    // iterate over the pixels in the top half of the image (the base image). reconstruct the original
    // image with alpha transparency by adjusting the color levels and setting the alpha channel.
    len = Math.floor(pixels.data.length / 2);
    for(i = 0; i < len; i += 4){
      j = len + i;

      // use red channel from mask as our alpha value (either RGB value should be the same and work)
      alpha = pixels.data[j];

      // if the pixel is fully transparent, set RGBA to 0
      if(alpha === 0){
        pixels.data[i] = pixels.data[i+1] = pixels.data[i+2] = pixels.data[i+3] = 0;
      }
      // otherwise, reconstruct the original color values
      else{
        normalizedAlpha = 255 / alpha;
        pixels.data[i + 0] = Math.round(pixels.data[i + 0] * normalizedAlpha);
        pixels.data[i + 1] = Math.round(pixels.data[i + 1] * normalizedAlpha);
        pixels.data[i + 2] = Math.round(pixels.data[i + 2] * normalizedAlpha);
        pixels.data[i + 3] = alpha;
      }
    }

    // draw the reconstructed image back to the canvas
    if(useCreateImageBitmap()){
      createImageBitmap(pixels).then(function(bitmap){
        ctx.drawImage(bitmap, 0, 0);
        callback(returnDataURL ? canvas.toDataURL() : canvas);
      });
    }
    else{
      ctx.putImageData(pixels, 0, 0);
      callback(returnDataURL ? canvas.toDataURL() : canvas);
    }
  };

  // expose public methods
  return {
    isSupported: isSupported,
    load: load
  };
})();