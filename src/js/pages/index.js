class Index {
    namespace = 'index';

    beforeEnter = data => {
        console.log('Index beforeEnter view')
    }
    afterEnter = data => {
        console.log('Index afterEnter view')
        // App.init();
    }
    beforeLeave = data => {
        console.log('Index beforeLeave view')
        // console.log(WorldController.element)
        // Stage.remove(WorldController.element)
    }
    afterLeave = data => {
        console.log('Index afterLeave view')
    }
}

export default new Index();