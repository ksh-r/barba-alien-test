# barba-alien-test
Repo to test page transitions with Alien.js

## Installation:
1. npm install
2. npm run dev
3. Go to localhost:1234

## Issue:
- Opening `index` page runs SSS example correctly, but going to `index2` and coming back does not display the `canvas` element.

## Barba.js working:
- The html pages have `data-barba="wrapper"` & `data-barba="container"` tags. When moving to another page, the content inside element having `data-barba="container"` tag is replaced with the next page's element having `data-barba="container"` by checking `data-barba-namespace`.
- Both html include `app.js` script which initializes Barba.
- Barba has transitions and views.
  - Transitions are objects used to animate moving to another page. They contain `once`, `enter` and `leave` methods.
    - `once` is executed when the page is first loaded.
    - `leave` is executed before leaving the current page (here we write fade away animations).
    - `enter` is executed when entering next page (here we write fade in animations)
  - We tell which transition to execute based on `to` condition.
  - View are used to initialize/destroy code during page transitions. (Example to add and remove eventListners after entering and leaving a page)
    - `beforeEnter` is executed before `once` or `enter` method, and so forth for the rest.