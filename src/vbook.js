/* --- the wrapper --- */

function initVbooks(selector, options = {}) {
	const els = document.querySelectorAll(selector);
	const instances = [];

	els.forEach(el => {
		if (!el.vbook) {
			el.vbook = new Vbook(el, options);
		}
		instances.push(el.vbook);
	});

	return instances.length === 1 ? instances[0] : instances;
}


/* --- the core --- */

(function (global, factory) {
  if (typeof module === "object" && typeof module.exports === "object") {
    // CommonJS / Node
    module.exports = factory();
  } else if (typeof define === "function" && define.amd) {
    // AMD
    define([], factory);
  } else {
    // Browser global
    global.Vbook = factory();
  }
})(typeof window !== "undefined" ? window : this, function () {

    class Vbook {

	constructor(element, options = {}) {
        
        this.book       = typeof element === "string" ? document.querySelector(element) : element;
		this.vb_body    = '';
		this._events    = {};
        this._handlers  = {};
		this.disabled   = false;
		this.autoPlay   = null;
        this.closing    = false;
        this.timer      = false;
        this.rotateTimer = false;
        
		// options + callbacks

		const defaults = {
			
            // dimenstions
            width: 210,
			height: 300,
			spine: 40,
            
			coverThikness: 2,
			coverColor: "#999",
			spineThikness: 2,
			spineColor: "#999",
			pagesOffset: 2,
			pages: 20,
			pagesColor: "#fff",
			
            // images
            book_img_cover: {},
			book_img_back: {},
			book_img_spine: {},
			book_img_pages_top: '',
			book_img_pages_side: '',
			book_img_pages_bottom: '',
			book_img_pages: {},
            
            // book shadows
            
            // initial book rotation
			rotateX: 0,
			rotateY: 0,
            rotateZ: 0,
            
            // interactions
            pageClick: true,
            pageSwipe: true,
            pageClickFirst: 'close',
            pageClickLast: 'close',
            bookClick: true,
            bookRotateX: true,
            bookRotateY: true,
            
            //ui
			uiButtons: true,
			uiPagination: true,
            uiPaginationLimit: 9,
            uiPageing: true,
            uiPageingDiv: '/',
            
		}
        
        const datasetOptions = this._parseDataset(this.book.dataset);
            
        
        this.options = Object.assign({}, defaults, datasetOptions, options);
		this._parseImages();

		

		// icons

		this.icon_arrow_right = `<svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M24.0166 12.0333L47.9834 36L24.0166 59.9667" stroke-miterlimit="10"/>
</svg>`;

		this.icon_arrow_left = `<svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M47.9834 12.0333L24.0166 36L47.9834 59.9667" stroke-miterlimit="10"/>
</svg>`;
        // Events aus "on: { ... }"  registrieren
        this._registerEvents();

		this._init();
	}
    
    // =============== Event System ===============
    
    /* Interne Event-Registrierung */
    
    _registerEvents() {
        if (this.options.on && typeof this.options.on === 'object') {
          for (const [eventName, handler] of Object.entries(this.options.on)) {
            if (typeof handler === 'function') this.on(eventName, handler);
          }
        }
    }

	on(event, handler) {
		if (!this._events[event]) this._events[event] = [];
		this._events[event].push(handler);
	}

	off(event, handler) {
		if (!this._events[event]) return;
		this._events[event] = this._events[event].filter(h => h !== handler);
	}

    emit(event, detail = {}) {
        if (this._events[event]) {
          this._events[event].forEach(fn => fn.call(this, detail));
        }
    }
    
    /* all events */
    init() {
		this._init();
	}
	destroy() {
		this.resizeObserver.disconnect();
		//this.book.innerHTML = "";
        this._applyTo('.vb-book', el => el.remove());
        this._applyTo('.pagination', el => el.remove());
        this._applyTo('.button', el => el.remove());        
		this.emit("destroy");
	}

	disable() {
        this._unbindEvents();
		this.disabled = true;
		this.book.classList.add("disabled");
		this.emit("disable");
	}

	enable() {
        this._bindEvents();
		this.disabled = false;
		this.book.classList.remove("disabled");
		this.emit("enable");
	}

	pageNum(num) {
		this.bookPageTo(num);
	}

	pageNext() {
		this.bookPage(1);
	}

	pagePrev() {
		this.bookPage(-1);
	}
	open() {
        this.bookOpen();
	}
	close() {
		this.bookClose();
	}

	rotateLeft() {
		this.rotateToAngle(-90);
	}

	rotateRight() {
		this.rotateToAngle(90);
	}
	fullscreen() {
		if (this.book.requestFullscreen) {
			this.book.requestFullscreen();
			this.emit("fullscreen");
		}
	}
	play() {
		this.autoPlay = setInterval(() => this.nextPage(), 2000);
		this.emit("play");
	}
	stop() {
		clearInterval(this.autoPlay);
		this.emit("stop");
	}
	

	/* =============== Overwrite lifecycle hooks =============== */
	
	_init() {
        this.emit("initBefore");
		
        // resets

		this.rotY  = this.options.rotateX;
		this.rotX  = this.options.rotateY;
        this.rotZ  = this.options.rotateZ;
        this.pages = this.options.pages;
		this.page_current = -1;
		this.page_count = this.options.pages;
		this.page_z = 0;
		this.state = 'closed';
        this.rotSpeedX = 0;
        this.rotSpeedY = 0;
        this.rotLoop   = false;
        
        // remove vbook specific classes
        
        this._removeClass('', 'open');
        this._removeClass('', 'opening');
        
		this._removeClass('', 'prepos');
        this._removeClass('', 'active');
        this._removeClass('', 'disabled');
        this._removeClass('', 'hover');
        
        // html
        
        this.book.innerHTML = `
            <div class="vb-book">
              <div class="vb-body">
                ${this._getCover()}
                ${this._getBackCover()}
                ${this._getSpine()}
                ${this._getBodyFaces()}
                ${this._getPages()}
              </div>
            </div>
            ${this._getUI()}
        `;
		this.vb_body = this.book.querySelector('.vb-book');

		// set the colors

		this._setStyles(".vb-cover .vb-face", "background-color", this.options.coverColor);
		this._setStyles(".vb-cover.vb-left .vb-face", "background-color", this.options.spineColor);
		this._setStyles(".vb-face.inner", "background-color", this.options.pagesColor);
		this._setStyles(".vb-page > div", "background-color", this.options.pagesColor);

		// set rotation
            
		this._setStyles('.vb-body', 'transform', `rotateY(${this.options.rotateY}deg) rotateX(${this.options.rotateX}deg) rotateZ(${this.options.rotateZ}deg)`);

		this.presize();
        this.updateUI();
		this._bindEvents();

		// observes size change of books parent container to resize the book
		this.resizeObserver = new ResizeObserver(() => this._resizeHandler());
		this.resizeObserver.observe(this.book.parentElement);

		// keyboard stuff
		this.book.tabIndex = 0;
		this.book.addEventListener("focus", () => this.bookActive());

		this.emit("init");
        this.emit("initAfter");

	}

	// some utilites -------------------------

	_applyTo(selector, fn) {
		if (selector) {
			this.book.querySelectorAll(selector).forEach(fn);
		} else {
			fn(this.book);
		}
	}
    _parseDataset(dataset) {
        const result = {};
        for (const [key, value] of Object.entries(dataset)) {
            if (value === "true") result[key] = true;
            else if (value === "false") result[key] = false;
            else if (!isNaN(value) && value.trim() !== "") result[key] = Number(value);
            else if ((value.startsWith("{") && value.endsWith("}")) ||
                     (value.startsWith("[") && value.endsWith("]"))) {
                try {
                    result[key] = JSON.parse(value);
                } catch {
                    result[key] = value;
                }
            } else result[key] = value;
        }
        return result;
    }
    
	_parseImages() {
		// Covers
		const front = this.book.querySelector(".cover.front");
		const back = this.book.querySelector(".cover.back");
		const spine = this.book.querySelector(".cover.spine");

		this.options.book_img_cover = front?.dataset.src || "";
		this.options.book_img_back = back?.dataset.src || "";
		this.options.book_img_spine = spine?.dataset.src || "";

		// Edges (pages)
		const head = this.book.querySelector(".edge.head");
		const tail = this.book.querySelector(".edge.tail");
		const fore = this.book.querySelector(".edge.fore");

		this.options.book_img_pages_top = head?.dataset.src || "";
		this.options.book_img_pages_bottom = tail?.dataset.src || "";
		this.options.book_img_pages_side = fore?.dataset.src || "";

		// Individual pages (array)
		const pages = this.book.querySelectorAll(".page");
		this.options.book_img_pages = Array.from(pages).map(p => p.dataset.src || "");
	}

	_setStyles = (selector, property, value) => {
		this._applyTo(selector, el => el.style[property] = value);
	}

	_setAttr = (selector, property, value) => {
		this._applyTo(selector, el => el.setAttribute(property, value));
	}

	_addClass(selector, cls) {
		this._applyTo(selector, el => el.classList.add(cls));
	}

	_removeClass(selector, cls) {
		this._applyTo(selector, el => el.classList.remove(cls));
	}

	// resizing ---------------------------------

	presize() {
		this.w = this.options.width;
		this.h = this.options.height;

		// ratios
		this.book_r = this.w / this.h;
		this.spine_r = this.options.spine / this.h;
		this.cover_depth_r = this.options.coverThikness / this.h;
		this.spine_depth_r = this.options.spineThikness / this.h;
		this.page_offset_r = this.options.pagesOffset / this.h;
		this._setStyles(".vb-book", "aspect-ratio", this.book_r);

		this.resize();
	}
        
    _resizeHandler() {
        this._addClass('', 'resizing');
        
        clearTimeout(this.timer);
        
        this.timer = setTimeout(() => {
             this._removeClass('', 'resizing');
        }, 200);
        this.resize();
    }
        
	resize() {
		// Breite + Höhe ermitteln
       
		this.w = this.vb_body.getBoundingClientRect().width;
		this.h = this.vb_body.getBoundingClientRect().height;
		const bookThickness = this.h * this.spine_r;
		const coverThickness = this.h * this.cover_depth_r;
		const spineThickness = this.h * this.spine_depth_r;
		const pageOffset = this.h * this.page_offset_r;

		// Helper-Funktion: sicheres Setzen

		const setStyle = (selector, property, value) => {
			const els = this.book.querySelectorAll(selector);
			els.forEach(el => {
				el.style[property] = value;
			});
		};
		// font size:
		this.book.style.fontSize = bookThickness + 'px';

		setStyle('.vb-cover.vb-front', 'transform', `translateZ(${bookThickness / 2 + coverThickness / 2}px)`);
		setStyle(".vb-cover.vb-back", "transform", `rotateY(180deg) translateZ(${bookThickness / 2 + coverThickness / 2}px)`);
        //setStyle(".vb-cover.vb-back", "transform", `rotateY(180deg) translateZ(0.5em)`);
		setStyle(".vb-cover.vb-left", "transform", `rotateY(-90deg) translateZ(${this.w / 2 + spineThickness / 2 - 0.1}px)`);

		/* covers depth */

		setStyle(".vb-cover > .vb-front", "transform", `translateZ(${coverThickness / 2}px)`);
		setStyle(".vb-cover > .vb-back", "transform", `translateZ(${-coverThickness / 2}px)`);

		setStyle(".vb-cover.vb-left > .vb-front", "transform", `translateZ(${spineThickness / 2}px)`);
		setStyle(".vb-cover.vb-left > .vb-back", "transform", `translateZ(${-spineThickness / 2}px)`);

		setStyle(".vb-cover > .vb-left", "width", `${coverThickness}px`);
		setStyle(".vb-cover > .vb-left", "transform", `rotateY(-90deg) translateZ(${this.w / 2}px)`);
		setStyle(".vb-cover > .vb-right", "width", `${coverThickness}px`);
		setStyle(".vb-cover > .vb-right", "transform", `rotateY(90deg) translateZ(${this.w / 2}px)`);

		setStyle(".vb-cover > .vb-top", "height", `${coverThickness}px`);
		setStyle(".vb-cover > .vb-top", "transform", `rotateX(90deg) translateZ(${this.h / 2}px)`);
		setStyle(".vb-cover > .vb-bottom", "height", `${coverThickness}px`);
		setStyle(".vb-cover > .vb-bottom", "transform", `rotateX(-90deg) translateZ(${this.h / 2}px)`);

		//spine
		setStyle(".vb-cover.vb-left > .vb-left", "width", `${spineThickness}px`);
		setStyle(".vb-cover.vb-left > .vb-left", "transform", `rotateY(-90deg) translateZ(${bookThickness / 2}px)`);
		setStyle(".vb-cover.vb-left > .vb-right", "width", `${spineThickness}px`);
		setStyle(".vb-cover.vb-left > .vb-right", "transform", `rotateY(90deg) translateZ(${bookThickness / 2}px)`);

		setStyle(".vb-cover.vb-left > .vb-top", "height", `${spineThickness}px`);
		setStyle(".vb-cover.vb-left > .vb-bottom", "height", `${spineThickness}px`);

		// inner

		setStyle(".vb-body > .inner.vb-top", "width", `${this.w - pageOffset}px`);
		setStyle(".vb-body > .inner.vb-top", "transform", `rotateX(90deg) rotateZ(0deg) translateZ(${this.h / 2 - pageOffset}px) translateX(${-pageOffset / 2}px)`);

		setStyle(".vb-body > .inner.vb-bottom", "width", `${this.w - pageOffset}px`);
		setStyle(".vb-body > .inner.vb-bottom", "transform", `rotateX(-90deg) rotateZ(180deg) translateZ(${this.h / 2 - pageOffset}px) translateX(${pageOffset / 2}px)`);

		setStyle(".vb-body > .inner.vb-right", "width", `${this.h - 2 * pageOffset}px`);
		setStyle(".vb-body > .inner.vb-right", "transform", `rotateY(90deg) rotateZ(90deg) translateZ(${this.w / 2 - pageOffset}px)`);

		// pages

		setStyle(".vb-body .vb-page", "height", `${this.h - 2 * pageOffset - 1}px`);
		setStyle(".vb-body .vb-page > div", "width", `${this.w - pageOffset - 1}px`);
		setStyle(".vb-body .vb-pages", "transform", `translateZ(${0}px)`);
        
        this.emit("resize");

	}

	// paging -----------

	bookPage(dir) {
        
        if(this.state !='open'){
            return;
        }
        let num = this.page_current;
		num += dir;
        console.log('pagedir:'+num)
        // num = last page close the book
		if (num > this.page_count - 1) {
            if(this.options.pageClickLast == 'close'){
                this.bookClosePages();
            }
            this.emit("clickPageLast");
			return;
		}
        // num = first page close the book
		if (num < 0) {
            if(this.options.pageClickFirst == 'close'){
                this.bookClosePages();
            }
            this.emit("clickPageFirst");
			return;
		}
		this.bookPageTo(num);

	};

	bookClosePages() {
		this.closing = true;
		if (this.page_current > 0) {
			console.log('closing:'+this.page_current);
            this.bookPage(-1);
		} else {
            this.closing = false ;
			this.bookClose();
		}
	}

	bookPageTo(num) {
        
        if(this.state !='open'){
            return;
        }
        /* limit num from 0 - 19 */
        if (num < 0) {
            num = 0;
        }
        if (num > this.page_count - 1) {
            num = this.page_count - 1;
        }
        this.page_current = num;
        
        this.emit("pageFlipBefore",{ page: num });

		this.page_z++;

		/* lift up the current page */
		if (num > 0) {
			let py = this.book.querySelectorAll('.vb-body .vb-pages .vb-page')[num-1];
			py.style['z-index'] = this.page_z;
		}
		/* add/remove flip classes */  
		for (let i = 0; i < this.page_count-1; i++) {
			let px = this.book.querySelectorAll('.vb-body .vb-pages .vb-page')[i];
			if (i < num) {
				px.classList.add('flip');
			} else {
				px.classList.remove('flip');
			}
		}
		/* repeat for closing all pages */
		if (this.closing == true) {
			setTimeout(() => {
				this.bookClosePages();
			}, 50);
		}
		/* set pagination */
        this.updateUI();
        this.emit("pageFlip", { page: num });
		this.emit("pageFlipAfter", { page: num });

	}
    
    updateUI(){
        let currentIndex = this.page_current;
        
        const pagination = this.book.querySelector('.pagination');
        const bullets = Array.from(this.book.querySelectorAll('.pagination .bullet'));
        const pageing = this.book.querySelector('.pageing .current');
       
        if(this.options.uiPaginationLimit){
            const visibleBullets = this.options.uiPaginationLimit;
            const half  = Math.floor(visibleBullets / 2);
            let start = currentIndex - half;
            let end = currentIndex + half;

            /* left limit */
            if (start < 0) {
                end += Math.abs(start);
                start = 0;
            }

            /* right limit */
            if (end > this.pages - 1) {
                const diff = end - (this.pages - 1);
                start -= diff;
                end = this.pages - 1;
                if (start < 0) start = 0;
            }

            bullets.forEach((b, i) => {
                /* remove all */
                b.classList.remove('on', 'hidden');

                /* set current active */
                if (i === currentIndex) {
                    b.classList.add('on');
                }

                /* Dynamic visibility */
                if (i < start || i > end) {
                    b.classList.add('hidden');
                }
            })
           
        }else{
            bullets.forEach((b, i) => {
                b.classList.remove('on', 'hidden');
                if (i === currentIndex) {
                    b.classList.add('on');
                }
            })
        }
        
        pageing.textContent = currentIndex+1;

        this.emit("updateUi", { currentIndex: currentIndex });
    }
   
	// =====================
	// Cover (Vorderseite)
	// =====================

	_getCover() {
		return `
		  <div class="vb-face vb-cover vb-front">
			<div class="vb-face vb-back ">
			  ${lazyImg(this.options.book_img_cover, "lazyload", 50)}
			  <div class="vb-page prehide">
				<div class="vb-back ">${lazyImg(this.options.book_img_pages[0], "", 50)}</div>
			  </div>
			</div>
			<div class="vb-face vb-front">${lazyImg(this.options.book_img_cover, "lazyload", 50)}</div>
			${this._getDepthFaces(this.options.coverThikness)}
		  </div>
		`;
	}

	// =====================
	// Back Cover (Rückseite)
	// =====================
	_getBackCover() {
		const lastPage = this.options.book_img_pages[this.options.book_img_pages.length - 1];
		return `
		  <div class="vb-face vb-cover vb-back">
			<div class="vb-face vb-back ">
			  ${lazyImg(this.options.book_img_back, "lazyload", 50)}
			  <div class="vb-page prehide">
				<div class="vb-back">${lazyImg(lastPage, "")}</div>
			  </div>
			</div>
			<div class="vb-face vb-front">${lazyImg(this.options.book_img_back, "lazyload", 50)}</div>
			${this._getDepthFaces(this.options.coverThikness)}
		  </div>
		`;
	}

	// =====================
	// Spine (Buchrücken)
	// =====================
	_getSpine() {
		return `
      <div class="vb-face vb-cover vb-left">
        <div class="vb-face vb-front">${lazyImg(this.options.book_img_spine, "lazyload", 50)}</div>
        <div class="vb-face vb-back">${lazyImg(this.options.book_img_spine, "lazyload", 50)}</div>
        ${this._getDepthFaces(this.options.spineThikness)}
      </div>
    `;
	}

	// =====================
	// Body (Ober-/Unterseite, rechte Seite)
	// =====================
	_getBodyFaces() {
		return `
      <div class="vb-face inner vb-right">${lazyImg(this.options.book_img_pages_side, "lazyload", 50)}</div>
      <div class="vb-face inner vb-top">${lazyImg(this.options.book_img_pages_top, "lazyload", 50)}</div>
      <div class="vb-face inner vb-bottom">${lazyImg(this.options.book_img_pages_bottom, "lazyload", 50)}</div>
    `;
	}

	// =====================
	// Pages (Innenseiten)
	// =====================
	_getPages() {

		const pages = this.options.pages;
		let html = '';
		for (let i = 0; i < pages - 1; i++) {
			
			html += `
            <div class="vb-page">
              <div class="vb-back">${lazyImg(this.options.book_img_pages[i + 1], "", 50)}</div>
              <div class="vb-front">${lazyImg(this.options.book_img_pages[i], "", 50)}</div>
            </div>
          `;
			
		}
		return `<div class="vb-pages prehide">${html}</div>`;

	}

	// =====================
	// UI
	// =====================
	_getUI() {

		const pages = this.options.pages;
		let html = '';
		let pagination = '';
		for (let i = 0; i < pages; i++) {
			pagination += '<div class="bullet hidden"></div>';
		}
		let buttons = `
        <button class="button icon left" data="left">${this.icon_arrow_left}</button>
        <button class="button icon right" data="right">${this.icon_arrow_right}</button>
      `;
		if (this.options.uiPagination === true) {
			html = `<div class="pagination">${pagination}</div>`;
		}
        if (this.options.uiPageing === true) {
			html += `<div class="pageing"><span class="current">${this.page_current+1}</span>${this.options.uiPageingDiv}<span class="total">${pages}</span></div>`;
		}
		if (this.options.uiButtons === true) {
			html += `${buttons}`;
		}
		return html;

	}

	// =====================
	// Depth-Faces (Seitenflächen bei Tiefe)
	// =====================
	_getDepthFaces(depth) {
		if (depth > 0) {
			return `
        <div class="vb-face vb-right"></div>
        <div class="vb-face vb-left"></div>
        <div class="vb-face vb-top"></div>
        <div class="vb-face vb-bottom"></div>
      `;
		}
		return "";
	}

	_bindEvents() {
        this._handlers = this._handlers || {};
        
        /* Pagination Clicks */
        if(this.options.uiPagination){
            this._handlers.paginationClick = (e, index) => {
                if (this.state == 'closed') this.bookOpen();
                this.bookPageTo(index);
            };
            this._applyTo('.pagination .bullet', (el, index) => {
                const handler = (e) => this._handlers.paginationClick(e, index);
                el.addEventListener('click', handler);
                this._handlers[`pagination_${index}`] = { el, handler, type: 'click' };
            });
        }
        /* Buttons */
        if(this.options.uiButtons){
            this._handlers.buttonClick = (e) => {
                e.stopPropagation();
                e.preventDefault();
                let el = e.currentTarget;
                let d = el.getAttribute('data');
                if (d == 'right') {
                    this.emit("ButtonNextClick");
                    if (this.state == 'open') this.bookPage(1);
                    else this.rotateToAngle(90);
                }
                if (d == 'left') {
                    this.emit("ButtonPrevClick");
                    if (this.state == 'open') this.bookPage(-1);
                    else this.rotateToAngle(-90);
                }
            };
            this._applyTo('.button', (el) => {
                el.addEventListener('click', this._handlers.buttonClick);
                this._handlers[`button_${el.getAttribute('data')}`] = { el, handler: this._handlers.buttonClick, type: 'click' };
            });
        }
        /* TouchTracker */

		this.tracker = new TouchTracker(this.vb_body, { threshold: 5 });
        this._handlers.tracker = this.tracker;

		let touchX = 0, touchY = 0;

		this.tracker.on("tap", (data) => {
            this.emit("click",data);
			if (this.state == 'open') {
				if(this.options.pageClick){
                    const rect = this.book.getBoundingClientRect();
                    const centerX = data.x - rect.left - rect.width / 2;
                    if (centerX > 0) {
                        this.emit("PageNextClick",data);
                        this.bookPage(1);
                    } else {
                        this.emit("PagePrevClick",data);
                        this.bookPage(-1);
                    }
                }
			} else {
                if(this.options.bookClick){
				    this.bookOpen();
                }               
			}
		});

		this.tracker.on("swipeLeft", (data) => {
			if (this.state == 'open' && this.options.pageSwipe) {
				this.emit("swipeLeft",data);
                this.bookPage(1);
			}
		});
		this.tracker.on("swipeRight", (data) => {
			if (this.state == 'open' && this.options.pageSwipe) {
				this.emit("swipeRight",data);
                this.bookPage(-1);
			}
		});
		this.tracker.on("touchdown", (data) => {
			this.emit("touchStart",data);
            touchX = data.x;
			touchY = data.y;
		});

		this.tracker.on("movestart", (data) => {
            
			this.isDragging = true;
			this._addClass('.vb-body', 'drag'); // needed to prevent transition while draging

		});
		this.tracker.on("touchmove", (data) => {
            this.emit("touchMove",data);
			this._removeClass('', 'prepos');
			
			// if (this.state == 'closed' && this.isDragging) {
            if (this.isDragging) {
				let deltaX = data.x - touchX;
				let deltaY = data.y - touchY;
				touchX = data.x;
				touchY = data.y;
				this.rotX += deltaX * 0.5;
				this.rotY -= deltaY * 0.5;
				this._setStyles('.vb-body', 'transform', `rotateY(${this.rotX}deg) rotateX(${this.rotY}deg)`);
			}
		});
		this.tracker.on("moveend", (data) => {
            this.emit("touchEnd");
			this.isDragging = false;
			this._removeClass('.vb-body', 'drag');

		});
	}
    
    _unbindEvents() {
        if (!this._handlers) return;

        /* remove all DOM-Listener */
        Object.keys(this._handlers).forEach((key) => {
            const h = this._handlers[key];
            if (h && h.el && h.handler && h.type) {
                h.el.removeEventListener(h.type, h.handler);
            }
        });

        /* stop TouchTracker */
        if (this._handlers.tracker && typeof this._handlers.tracker.destroy === 'function') {
            this._handlers.tracker.destroy();
        }

        this._handlers = {};
    }
    
    
    rotateStop() {
        this.rotLoop = false;
    }
    
    animate(){
        this.rotX += this.rotSpeedX;
        this.rotY += this.rotSpeedY;

        /* modulo 360 fo stability */
        if (this.rotX >= 360) this.rotX -= 360;
        if (this.rotY >= 360) this.rotY -= 360;

        this._setStyles('.vb-body', 'transform', `rotateY(${this.rotX}deg) rotateX(${this.rotY}deg)`);
        if(this.rotLoop == true){
            requestAnimationFrame(this.animate.bind(this));
        }
    }

    rotateBy(x,y,loop=false) {
        if(this.state !='closed' || this.rotLoop == true){
            return;
        }
        this.rotateStop();
       
        this.rotSpeedX = x;
        this.rotSpeedY = y;
        this.rotLoop   = loop;
        this.animate();

	}
   
    rotateToAngle(x=false,y=false) {
        if(this.state !='closed'){
            return;
        }
        this.rotateStop();
        if (x !== false) {
            this.rotX = this._rightAngle(this.rotX) + x;
        }
        if (y !== false) {
             this.rotY = this._rightAngle(this.rotY) + y;
        }
        this._setStyles('.vb-body', 'transform', `rotateY(${this.rotX}deg) rotateX(${this.rotY}deg)`);
    }
	_rightAngle(v) {
		if (v % 90 === 0) {
			return v;
		}
		v = Math.ceil(v / 90) * 90;
		return v;
	}
    rotateTo(x=false,y=false) {
        if(this.state != 'closed'){
            return;
        }
        this.rotateStop();
        if (x !== false) {
            this.rotX = x;
        }
        if (y !== false) {
            this.rotY = y;
        }
		this._setStyles('.vb-body', 'transform', `rotateY(${this.rotX}deg) rotateX(${this.rotY}deg)`);
	    
    }
   
	bookOpen() {
		if(this.state != 'closed'){
            return;
        }
        this.rotateStop();
        this.emit("bookOpenBefore");

		this.page_current = 0;
		this.state = 'open';
		this._addClass('img', 'lazyload');
		this._removeClass('.vb-page', 'flip');
		this._setStyles('.vb-body', 'transform', '');
		this._setAttr('', 'data-state', 'open');
		this._setAttr('', 'data-state', 'open');
		this._addClass('', 'open');
        this._addClass('', 'opening');
		this._removeClass('', 'prepos');

        this.updateUI();

        setTimeout(() => {
			this._removeClass('', 'opening');
		}, 1000);

		this.emit("bookOpen");
	}

	bookClose() {
        if(this.state != 'open'){
            return;
        }
        this.emit("bookCloseBefore");
        this.page_current = -1;
		
		this._removeClass('.vb-page', 'flip');
		this._removeClass('', 'open');
        this._addClass('', 'closing');
        this.updateUI();

		/* reset oritentation */
		this._setStyles('.vb-body', 'transform', `rotateY(0deg) rotateX(0deg) translateX(0%)`);

		this.rotX = 0;
		this.rotY = 0;

		setTimeout(() => {
			this.bookCloseAfter();
		}, 1000);

		this.emit("bookClose");

	}

	bookCloseAfter() {

		for (let i = 0; i < this.page_count; i++) {
			let p = this.book.querySelectorAll('.vb-body .vb-pages .vb-page')[i];
            if(p){
                p.style['z-index'] = this.page_count - i;
            }
		}

		this.page_current = -1;
		this.state = 'closed';
		this._setAttr('', 'data-state', 'closed');
		this._removeClass('', 'closing');

        this.emit("bookCloseAfter");

	}

	/* keyboard stuff */

	bookActive() {
		/* remove active states + keyhandler on all books arround */

		document.querySelectorAll('.vbook').forEach(el => {
			el.classList.remove('active');
			if (el._keyHandler) {
				document.removeEventListener("keydown", el._keyHandler);
				el._keyHandler = null;
			}
			
		});

		/* add key handler */
		this.book.classList.add('active');
		this._keyHandler = (e) => {

			console.log(e.key)
			switch (e.key) {
				case "Enter":
					e.preventDefault();
					if (this.state == "closed") {
						this.bookOpen();
					} else {
						this.bookClose();
					}
					break;
				case " ":
					e.preventDefault();
					if (this.state == "open") {
						this.bookClose();
					} else {
						this.bookOpen();
					}
					break;
				case "ArrowRight":
					e.preventDefault();
					if (this.state == "open") {
						this.bookPage(1);
					} else {
						this.rotateToAngle(90);
					}
					break;
				case "ArrowLeft":
					e.preventDefault();
					if (this.state == "open") {
						this.bookPage(-1);
					} else {
						this.rotateToAngle(-90);
					}
					break;
			}
		};

		document.addEventListener("keydown", this._keyHandler);

		this.emit("active");
	}
}


/* ------------------ helper function -------------------- */

function lazyImg(src, className = "", size = 100) {
	if (!src) return "";
	return `<img src="${src}" class="${className}" loading="lazy" width="${size}%" alt="book image" />`;
}

/* ------------------ mouse/finger tracking -------------------- */

class TouchTracker {
	constructor(el, options = {}) {
		this.el = el;
		this.events = {};
		this.touchData = {};
		this.active = false;
		this.moved = false;
		this.threshold = options.threshold || 5;

		/* Bound handlers for later removal */
		this._touchMove = (e) => this.move(e.touches, true, e);
		this._touchEnd = () => this._endHandler(true);
		this._mouseMove = (e) => this.move([{ clientX: e.clientX, clientY: e.clientY }], false);
		this._mouseUp = () => this._endHandler(false);

		this.init();
	}

	/* --- Event system --- */
	on(eventName, handler) {
		if (!this.events[eventName]) this.events[eventName] = [];
		this.events[eventName].push(handler);
	}

	off(eventName, handler) {
		if (this.events[eventName]) {
			this.events[eventName] = this.events[eventName].filter(fn => fn !== handler);
		}
	}

	emit(eventName, data) {
		if (this.events[eventName]) {
			this.events[eventName].forEach(fn => fn(data));
		}
	}

	/* --- Initialization ---  */
	init() {
		// Bound start handlers (so they can be removed later)
		this._boundTouchStart = (e) => {
			this.start(e.touches, true);
			document.addEventListener("touchmove", this._touchMove, { passive: false });
			document.addEventListener("touchend", this._touchEnd);
		};

		this._boundMouseStart = (e) => {
			this.active = true;
			this.start([{ clientX: e.clientX, clientY: e.clientY }], false);
			document.addEventListener("mousemove", this._mouseMove);
			document.addEventListener("mouseup", this._mouseUp);
		};

		this.el.addEventListener("touchstart", this._boundTouchStart, { passive: false });
		this.el.addEventListener("mousedown", this._boundMouseStart);
	}

	/* --- Touch / mouse start --- */
	start(points, isTouch = true) {
		const now = Date.now();
		const pts = Array.from(points);

		this.touchData = {
			startX: pts[0].clientX,
			startY: pts[0].clientY,
			startTime: now,
			fingers: pts.length,
			fingerData: pts.map(f => ({ x: f.clientX, y: f.clientY }))
		};
		this.moved = false;

		this.emit("touchdown", {
			x: this.touchData.startX,
			y: this.touchData.startY,
			fingers: this.touchData.fingers,
			fingerData: this.touchData.fingerData,
			inputType: isTouch ? "touch" : "mouse"
		});
	}

	/* --- Movement --- */
	move(points, isTouch = true, event) {
		if (event) event.preventDefault();

		const pts = Array.from(points);
		const dx = pts[0].clientX - this.touchData.startX;
		const dy = pts[0].clientY - this.touchData.startY;
		const distance = Math.sqrt(dx * dx + dy * dy);

		this.touchData.lastX = pts[0].clientX;
		this.touchData.lastY = pts[0].clientY;

		if (distance >= this.threshold) {
			if (!this.moved) {
				this.moved = true;
				this.emit("movestart", {
					x: pts[0].clientX,
					y: pts[0].clientY,
					dx, dy,
					direction: this.getDirection(dx, dy),
					distance,
					fingers: pts.length,
					fingerData: pts.map(f => ({ x: f.clientX, y: f.clientY })),
					inputType: isTouch ? "touch" : "mouse"
				});
			}
			this.emit("touchmove", {
				x: pts[0].clientX,
				y: pts[0].clientY,
				dx, dy,
				direction: this.getDirection(dx, dy),
				distance,
				fingers: pts.length,
				fingerData: pts.map(f => ({ x: f.clientX, y: f.clientY })),
				inputType: isTouch ? "touch" : "mouse"
			});
		}
	}

	/* --- Touch / mouse end --- */
	_endHandler(isTouch) {
		this.end(isTouch);

		// Remove global listeners
		if (isTouch) {
			document.removeEventListener("touchmove", this._touchMove);
			document.removeEventListener("touchend", this._touchEnd);
		} else {
			document.removeEventListener("mousemove", this._mouseMove);
			document.removeEventListener("mouseup", this._mouseUp);
		}
	}

	end(isTouch = true) {
		const now = Date.now();
		const duration = now - this.touchData.startTime;
		const dx = (this.touchData.lastX || this.touchData.startX) - this.touchData.startX;
		const dy = (this.touchData.lastY || this.touchData.startY) - this.touchData.startY;
		const distance = Math.sqrt(dx * dx + dy * dy);
		const dir = this.getDirection(dx, dy);

		const payload = {
			x: this.touchData.lastX || this.touchData.startX,
			y: this.touchData.lastY || this.touchData.startY,
			dx, dy,
			direction: dir,
			distance,
			duration,
			fingers: this.touchData.fingers,
			fingerData: this.touchData.fingerData,
			inputType: isTouch ? "touch" : "mouse"
		};

		if (!this.moved && distance < this.threshold) {
			this.emit("tap", payload);
		} else {
			this.emit("touchup", payload);
			this.emit("swipe", payload);
			this.emit("moveend", payload);

			if (dir === "left") this.emit("swipeLeft", payload);
			if (dir === "right") this.emit("swipeRight", payload);
			if (dir === "up") this.emit("swipeUp", payload);
			if (dir === "down") this.emit("swipeDown", payload);
		}
	}

	/* --- Direction detection --- */
	getDirection(dx, dy) {
		if (Math.abs(dx) > Math.abs(dy)) {
			return dx > 0 ? "right" : "left";
		} else {
			return dy > 0 ? "down" : "up";
		}
	}

	/* --- Cleanup --- */
	destroy() {
		// Remove global listeners
		document.removeEventListener("touchmove", this._touchMove);
		document.removeEventListener("touchend", this._touchEnd);
		document.removeEventListener("mousemove", this._mouseMove);
		document.removeEventListener("mouseup", this._mouseUp);

		// Remove start listeners from the element
		if (this.el) {
			this.el.removeEventListener("touchstart", this._boundTouchStart, { passive: false });
			this.el.removeEventListener("mousedown", this._boundMouseStart);
		}

		// Clear internal state
		this.events = {};
		this.touchData = {};
		this.active = false;
		this.moved = false;
		this.el = null;
	}
}


return Vbook;
});



