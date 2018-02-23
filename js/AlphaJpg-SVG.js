/**
 * AlphaJpg allows one to load a specially crafted JPG file which contains both image and alpha channel data
 * and use it to reconstruct an image with semi-transparency. When working with photographic imagery that
 * requires transparency, typically PNG-24 is the only option with wide browser support. This library allows
 * for loading images with the bennefits of JPG compression AND alpha transparency. Internally, this library
 * reconstructs the original image using a SVG Filter.
 * 
 * @author Aaron Graham
 */
var AlphaJpg_SVG = (function(){

  var _supportsSVGFilter = null,
      _filterId = 0;

  /**
   * Attempts to determine whether the browser supports SVG Filters
   * 
   * @private
   * @returns {bool}
   */
  var supportsSVGFilter = function(){
    if(_supportsSVGFilter !== null){
      return _supportsSVGFilter;
    }

    var ua = window.navigator.userAgent,
        ie = ua.indexOf("MSIE ") !== -1 || ua.match(/Trident.*rv\:11\./),
        ie10 = !!(Function('/*@cc_on return document.documentMode===10@*/')()),
        ie11 = !!(!(window.ActiveXObject) && "ActiveXObject" in window),
        div = document.createElement('DIV'),
        inlineSVG;

    div.innerHTML = '<svg/>';
    inlineSVG = (div.firstChild && div.firstChild.namespaceURI === 'http://www.w3.org/2000/svg'); 

    _supportsSVGFilter = (inlineSVG && (!ie || (ie && (ie10 || ie11))));
    return _supportsSVGFilter;
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
    return (supportsSVGFilter() && !testDataURI);
  };

  /**
   * Creates an image with alpha transparency from a specially crafted JPG file containing both the source
   * image and an alpha transparency mask.
   * 
   * @public
   * @param {string} imgUrl The source image URL. The image may need to have appropriate CORS headers 
   *   set or be served from the same domain as your application.
   * @param {function} callback The callback function to be called once the finished image has been 
   *   reconstructed. The callback function will be passed a single argument which may be either boolean false
   *   (indicating an error has occurred) or a <svg> DOMElement.
   * @param {bool} returnDataUrl (Optional) If true, the function will attempt to return the finished image
   *   as a base64 encoded data uri. Ex. "data:image/png;base64,iVBORw0K...truncated"
   * @return {void}
   */
  var load = function(imgUrl, callback){
    var returnDataURL = arguments.length > 2 ? !!arguments[2] : false,
        image;

    // bailout if the user didn't supply a valid callback, image URL, or the browser isn't supported
    if(typeof imgUrl !== 'string' || typeof callback !== 'function' || !isSupported(returnDataURL)){
      callback(false);
      return;
    }

    image = new Image();

    image.onload = function(){
      reconstructViaSVG(image, imgUrl, callback);
    };

    if(!isSameOrigin(imgUrl)){
      image.crossOrigin = '';
    }

    image.onerror = function(){
      callback(false);
    };

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
   * Reconstructs the image using a SVG document and custom SVG Filter.
   * 
   * @private
   * @param {object} img The source <img> DOM element
   * @param {string} imgUrl The source image's URL
   * @param {function} callback Function to call after the image has been reconstructed.
   * @returns {void}
   */
  var reconstructViaSVG = function(img, imgUrl, callback){

    var w = img.naturalWidth,
        h = img.naturalHeight,
        h2 = Math.floor(h / 2),
        div = document.createElement('DIV'),
        svg = '<svg viewBox="0 0 '+w+' '+h2+'" width="'+w+'" height="'+h2+'">'+
                '<defs>'+
                  '<filter id="alphajpg_filter'+_filterId+'" color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x="0" y="0" width="'+w+'" height="'+h+'">'+
                    '<feImage xlink:href="'+imgUrl+'" result="orig_img"/>'+
                    '<feOffset dx="0" dy="-'+h2+'" in="orig_img" result="mask_img"/>'+
                    '<feColorMatrix in="mask_img" result="mask_alpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -1 0 0 0 1"/>'+
                    '<feComposite in="orig_img" in2="mask_alpha" operator="arithmetic" k1="0" k2="1" k3="-1" k4="0"/>'+
                  '</filter>'+
                '</defs>'+
                '<rect x="0" y="0" width="'+w+'" height="'+h2+'" style="filter:url(#alphajpg_filter'+_filterId+');"/>'+
              '</svg>'
    ;

    _filterId++;

    div.innerHTML = svg;
    svg = div.removeChild(div.childNodes[0]);

    callback(svg);
  };

  // expose public methods
  return {
    isSupported: isSupported,
    load: load
  };
})();