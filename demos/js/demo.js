var Demo = {
  init : function(){
    // attach event handlers
    document.getElementById('source-open').addEventListener('click', Demo.showSource);
    document.getElementById('source-close').addEventListener('click', Demo.hideSource);
    document.getElementById('source-body').addEventListener('click', Demo.blockEvent);
    document.getElementById('source-overlay').addEventListener('click', Demo.hideSource);
    document.getElementById('about-open').addEventListener('click', Demo.showAbout);
    document.getElementById('about-close').addEventListener('click', Demo.hideAbout);
    document.getElementById('about-body').addEventListener('click', Demo.blockEvent);
    document.getElementById('about-overlay').addEventListener('click', Demo.hideAbout);
    document.addEventListener('keyup', Demo.docOnKeyUp);

    // set code source and prettify
    Demo.initSource();
  },

  initSource : function(){
    var code = document.getElementById('source-code').innerHTML;
    code = code.replace(/^ {4}/gm, '')
               .replace(/^\s+/, '')
               .replace(/\s+$/, '')
               .replace(/&([a-z]+);/ig, 'XXXXX$1;')
               .replace(/&/g, '&amp;')
               .replace(/</g, '&lt;')
               .replace(/>/g, '&gt;')
               .replace(/^.*\/\/\s*source\-ignore.*\n/gm, '')
               .replace(/XXXXX([a-z]+);/ig, '&$1;');
    document.getElementById('source-pre').innerHTML = "\n"+code;
    prettyPrint();
  },

  blockEvent : function(evt){
    evt.stopPropagation();
  },

  docOnKeyUp : function(evt){
    evt = evt || window.event;
    var isEscape = false;
    if('key' in evt){
      isEscape = (evt.key == "Escape" || evt.key == "Esc");
    }
    else{
      isEscape = (evt.keyCode == 27);
    }
    if(isEscape){
      Demo.hideSource();
    }
  },

  showSource : function(){
    document.getElementById('source-overlay').style.display = 'block';
  },

  hideSource : function(){
    document.getElementById('source-overlay').style.display = 'none';
  },

  showAbout: function(){
    document.getElementById('about-overlay').style.display = 'block';
  },

  hideAbout: function(){
    document.getElementById('about-overlay').style.display = 'none';
  }

};

Demo.init();