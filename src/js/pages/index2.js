class Index2 {
    namespace = 'index2';

    beforeEnter = data => {
        console.log('Index2 beforeEnter view')
    }
    afterEnter = data => {
        console.log('Index2 afterEnter view')
    }
    beforeLeave = data => {
        console.log('Index2 beforeLeave view')
    }
    afterLeave = data => {
        console.log('Index2 afterLeave view')
    }
}

export default new Index2();