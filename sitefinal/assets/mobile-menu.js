/* LDP — Mobile menu controller. Simple version. */
(function(){
  function init(){
    // Close menu when any nav link is clicked
    var menu = document.querySelector('nav.top .menu');
    if(!menu) return;
    menu.querySelectorAll('a').forEach(function(a){
      a.addEventListener('click', function(){
        document.body.classList.remove('menu-open');
      });
    });
    // ESC closes
    document.addEventListener('keydown', function(e){
      if(e.key === 'Escape') document.body.classList.remove('menu-open');
    });
    // Lang buttons in footer sync with top bar
    menu.querySelectorAll('.menu-foot .lang button[data-lang]').forEach(function(b){
      b.addEventListener('click', function(){
        var lg = b.getAttribute('data-lang');
        var twin = document.querySelector('nav.top .right .lang button[data-lang="'+lg+'"]');
        if(twin) twin.click();
      });
    });
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
