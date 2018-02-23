<?php
/**
 * A command line utility for converting a PNG file into an alphaJpg compatible file.
 * 
 * Usage:
 * $ php alphaJpg.php inFile.png outputDir/
 * 
 * @author Aaron Graham
 */

// only allow script execution from the command line
if(!isset($argc) || !isset($argv)){ exit; }

error_reporting(E_ALL);
ini_set('display_errors', 'stderr');
ini_set('memory_limit', '256M');
set_time_limit(0);

$CMD_NAME = pathinfo(__FILE__, PATHINFO_FILENAME);
$CMD_NAME_UCASE = strtoupper($CMD_NAME);

// full "man-like" documentation
$USAGE = <<<EOD
$CMD_NAME_UCASE

NAME
       $CMD_NAME - A command line utility for converting a PNG file into an 
       alphaJpg compatible JPG file.

SYNOPSIS
       php $CMD_NAME [OPTIONS] in_file out_dir

DESCRIPTION
       The group of AlphaJpg.js libraries requires a JPG image that is 
       specially crafted. This JPG includes the original PNG image over a
       black background as well as a black and white transparency mask. This
       command line tool allows one to easily create such a JPG image from
       a PNG source image.

       in_file 
            A path to a valid PNG24 source file.

       out_dir
            A directory where the converted output image will be saved. The
            output file name will be the same as the input file except that 
            it will have a ".alpha" suffix added before the file extension.
            Ex. myPhoto.png -> myPhoto.alpha.jpg

OPTIONS
       -p[ng]
            Save the output file as a PNG instead of the default JPG. This may
            be helpful if one wishes to convert and compress the image to a JPG
            file manually as it is loseless and does not generate any of JPG's
            visual artifacts.

       -q[uality]=INT
            Set the JPG compression level for the output file. INT must be a 
            number between 1 - 100. The default is value 75. This option is 
            ignored when the -p[ng] flag has been supplied.

DEPENDANCIES
       This utility requires that PHP be compiled with either of the following
       image manipulation extensions.

       - GD (http://php.net/manual/en/book.image.php)
       - ImageMagick (http://php.net/manual/en/book.imagick.php)

EXAMPLES
       Create a JPG file out/myImage.alpha.jpg with default quality (75%).

       #> php $CMD_NAME somePath/myImage.png out/

       Create a PNG file myImage.alpha.png in the current directory.

       #> php $CMD_NAME -p somePath/myImage.png .

       Create a JPG file myImage.alpha.jpg in the current directory with 
       JPG compression quality 80%.

       #> php $CMD_NAME -quality=80 somePath/myImage.png .

AUTHOR
       Written by Aaron Graham

COPYRIGHT
       This is free software: you are free to change and redistribute it. 
       There is NO WARRANTY, to the extent permitted by law. For more 
       information, please refer to <http://unlicense.org>

EOD;

// if an invalid number of arguments were supplied, display the usage documentation
$num_args = count($argv);
if($num_args < 3){
  echo $USAGE;
  exit;
}

// parse command line arguments
$out_dir_orig = $argv[$num_args-1];
$in_path_orig = $argv[$num_args-2];

$options = [];
for($i = 1; $i < $num_args-2; $i++){
  $options[] = $argv[$i];
}

// set defaults
$quality = 75;
$save_as_png = false;

// parse options
foreach($options as $i => $option){
  $matches = [];
  if(preg_match('/^\-p(ng)?$/', $option)){
    $save_as_png = true;
  }
  elseif(preg_match('/^\-q(uality)?=(\d+)$/', $option, $matches)){
    $quality = (int)$matches[2];
  }
  else{
    echo $USAGE;
    exit;
  }
}

// make sure either GD or ImageMagick is available
$has_gd = extension_loaded('gd');
$has_imagick = extension_loaded('imagick');
if(!$has_gd && !$has_imagick){
  bailout('This utility requires one of the following image manipulation PHP extensions to be installed: GD, ImageMagick. None found.');
}

// validate arguments supplied on command line
$in_path = realpath($in_path_orig);
if(!($in_path && @is_readable($in_path))){
  bailout('Supplied in_file could not be opened ('.$in_path_orig.').');
}
if(@exif_imagetype($in_path) !== IMAGETYPE_PNG){
  bailout('Supplied in_file must be a PNG image ('.$in_path_orig.').');
}

$out_dir = realpath($out_dir_orig);
if(!$out_dir){
  bailout('Supplied out_dir does not exist ('.$out_dir_orig.').');
}
if(!@is_writable($out_dir)){
  bailout('Supplied out_dir is not writable ('.$out_dir_orig.').');
}

if($quality < 1 || $quality > 100){
  bailout('Supplied -quality must be an integer between 1 - 100');
}

// get source image dimensions
$size = @getimagesize($in_path);
if(!$size){
  bailout('Failed to get dimensions of supplied PNG image ('.$in_path_orig.').');
}
$width = (int)$size[0];
$height = (int)$size[1];

// create path to output file
$out_filename = pathinfo($in_path, PATHINFO_FILENAME);
$extension = $save_as_png ? 'png' : 'jpg';
$out_path = $out_dir.DIRECTORY_SEPARATOR.$out_filename.'.alpha.'.$extension;

// create alphaJpg compatible JPG. prefer Imagick method because it's alpha channel support is better
// and there seem to be fewer image artifacts when saving as 100% JPG.
$result = $has_imagick ? alphaJpgImagick($in_path, $width, $height, $out_path, $quality, $save_as_png) : alphaJpgGD($in_path, $width, $height, $out_path, $quality, $save_as_png);
if(!$result){
  bailout('Failed to create output image.');
}

exit(0);

/**
 * Create alphaJpg image using the ImageMagick library.
 * 
 * @param string $in_path Filesystem path to the source PNG file.
 * @param int $width Width in pixels of source image.
 * @param int $height Height in pixels of source image.
 * @param string $out_path Filesystem path to write processed JPG file.
 * @param int $quality The JPG compression quality to use.
 * @param bool $save_as_png Flag specifying whether the output image should be saved as a PNG.
 * @return boolean
 */
function alphaJpgImagick($in_path, $width, $height, $out_path, $quality, $save_as_png){
  try {
    // create destination image
    $dst_img = new Imagick();
    $dst_img->newImage($width, $height*2, new ImagickPixel('#000000'));

    // composite the source image at the top over the default black background
    $src_img = new Imagick($in_path);
    $dst_img->compositeImage($src_img, Imagick::COMPOSITE_ATOP, 0, 0, Imagick::CHANNEL_ALL);

    // generate the black and white alpha mask. manipulating each pixel individually is very slow,
    // so speed things up considerably by using a color matrix to create the mask.
    $color_matrix = [
      0.0, 0.0, 0.0, 1.0, 0.0,
      0.0, 0.0, 0.0, 1.0, 0.0,
      0.0, 0.0, 0.0, 1.0, 0.0,
      0.0, 0.0, 0.0, 0.0, 1.0,
      0.0, 0.0, 0.0, 0.0, 0.0
    ];
    $src_img->colorMatrixImage($color_matrix);
    $src_img->setImageOpacity(1);

    // composite the mask image at the bottom of the output image
    $dst_img->compositeImage($src_img, Imagick::COMPOSITE_ATOP, 0, $height, Imagick::CHANNEL_ALL);

    // save the finished image
    if($save_as_png){
      $dst_img->setImageFormat('png'); 
    }
    else{
      $dst_img->setImageFormat('jpeg'); 
      $dst_img->setImageCompression(Imagick::COMPRESSION_JPEG); 
      $dst_img->setImageCompressionQuality($quality);
    }
    $dst_img->writeImage($out_path);

    // clean up images
    $src_img->destroy();
    $dst_img->destroy();
  }
  catch(Exception $ex){
    return false;
  }

  return true;
}

/**
 * Create alphaJpg image using GD image library.
 * 
 * @param string $in_path Filesystem path to the source PNG file.
 * @param int $width Width in pixels of source image.
 * @param int $height Height in pixels of source image.
 * @param string $out_path Filesystem path to write processed JPG file.
 * @param int $quality The JPG compression quality to use.
 * @param bool $save_as_png Flag specifying whether the output image should be saved as a PNG.
 * @return boolean
 */
function alphaJpgGD($in_path, $width, $height, $out_path, $quality, $save_as_png){
  if(false === ($src_img = @imagecreatefrompng($in_path))){ return false; }

  // create destination image that has default black background
  if(false === ($dst_img = @imagecreatetruecolor($width, $height*2))){ return false; }

  // enable alpha blending so black background comes through semi-transparent pixels
  if(false === @imagealphablending($dst_img, true)){ return false; }

  // draw source image at top over black background
  if(false === @imagecopy($dst_img, $src_img, 0, 0, 0, 0, $width, $height)){ return false; }

  // draw the black and white alpha mask to the bottom of the destination image
  for($x = 0; $x < $width; $x++){
    for($y = 0; $y < $height; $y++){
      if(false === ($rgba = @imagecolorat($src_img, $x, $y))){ return false; }

      // internally GD treats alpha channel from 0-127. normalize to 0-255. this is not awesome.
      $a = (($rgba >> 24) & 0x7F) * 2;
      if($a === 254){ $a = 255; }

      if(false === ($color = @imagecolorallocate($dst_img, 255 - $a, 255 - $a, 255 - $a))){ return false; }
      if(false === @imagesetpixel($dst_img, $x, $y + $height, $color)){ return false; }
    }
  }

  // save final image
  if($save_as_png){
    if(false === @imagepng($dst_img, $out_path, 9)){ return false; }
  }
  else{
    if(false === @imagejpeg($dst_img, $out_path, $quality)){ return false; }
  }

  // clean up our images
  @imagedestroy($src_img);
  @imagedestroy($dst_img);

  return true;
}

/**
 * Prints a message to STDERR and stops script execution.
 * 
 * @param string $msg (Optional) The error message. Default is an empty string.
 */
function bailout($msg = ''){
  $msg = trim((string)$msg);
  if($msg){
    fprintf(STDERR, "\nERROR: %s\n", $msg);
  }
  exit(1);
}
