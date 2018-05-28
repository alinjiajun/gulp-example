const config = require('./config')
const fs = require('fs')
const path = require('path')
const chalk = require('chalk')
const gulp = require('gulp')
const gulpif = require('gulp-if')
const htmlmin = require('gulp-htmlmin')
const fileinclude = require('gulp-file-include')
const sass = require('gulp-sass')
const postcss = require('gulp-postcss')
const cleanCSS = require('gulp-clean-css')
const plumber = require('gulp-plumber')
const notify = require('gulp-notify')
const cache  = require('gulp-cache')
const imagemin = require('gulp-imagemin')
const pngquant = require('imagemin-pngquant')
const uglify = require('gulp-uglify')
const eslint = require('gulp-eslint')
const stripDebug = require('gulp-strip-debug')
const babel = require('gulp-babel')
const sequence = require('gulp-sequence')
const zip = require('gulp-zip')
const del = require('del')
const rename = require('gulp-rename')
const spritesmith = require('gulp.spritesmith')
var buffer = require('vinyl-buffer');

//生产文件添加hash值修改版本
var runSequence = require('run-sequence');
var rev = require('gulp-rev'); 
var revCollector = require('gulp-rev-collector');  

// webpack
const webpack = require('webpack')
const webpackStream = require('webpack-stream')
const webpackConfig = require('./webpack.config.js')

// server
const browserSync = require('browser-sync').create()
const reload = browserSync.reload

// NODE_ENV
const env = process.env.NODE_ENV || 'development'
const condition = env === 'production'

function respath(dir) {
  return path.join(__dirname, './', dir)
}

function onError(error) {
  const title = error.plugin + ' ' + error.name
  const msg = error.message
  const errContent = msg.replace(/\n/g, '\\A ')

  notify.onError({
    title: title,
    message: errContent,
    sound: true
  })(error)

  this.emit('end')
}

function cbTask(task) {
  return new Promise((resolve, reject) => {
    del(respath('dist'))
    .then(paths => {
      console.log(chalk.green(`
      -----------------------------
        Clean tasks are completed
      -----------------------------`))
      sequence(task, () => {
        console.log(chalk.green(`
        -----------------------------
          All tasks are completed
        -----------------------------`))
        resolve('completed')
      })
    })
  })
}


//收集需要压缩的雪碧图
const spritesArr = [];
(function () { 
  let spritesDirs = respath('src/static/sprites');

  fs.readdirSync(spritesDirs).forEach((name) => {
    let spritesDir = path.resolve(`${spritesDirs}/${name}`);
    let state = fs.lstatSync(spritesDir);
    if(state.isDirectory() && fs.readdirSync(spritesDir).length){
      let gulpTask = `sprites:${spritesDir}`;
      spritesArr.push(gulpTask);
      gulp.task(gulpTask, () => {
        let spritesData = gulp.src(path.resolve(spritesDir, './*.png'))
        .pipe(spritesmith({
          imgName: `${name}_icon.png`,
          imgPath: `${name}/${name}_icon.png`,
          cssName: `${name}_icon.scss`,
          padding: 5
        }));
        spritesData.css
        .pipe(gulp.dest(path.resolve(__dirname, './src/static/styles')));
        spritesData.img
        .pipe(buffer())
        .pipe(imagemin())
        .pipe(gulp.dest(path.resolve(__dirname, './src/static/images')));
      })
    }
  })
})();

  
var revpath = config.build.static// 源文件夹
var revmiddlefile = './revmiddlefile'// 目标文件夹
// 定义css、js源文件路径
var cssSrc = revpath + '/css/*.css',
  jsSrc = revpath + '/js/*.js',
  imgSrc = revpath + '/images/*.*';
  
// CSS生成文件hash编码并生成 rev-manifest.json文件名对照映射
gulp.task('revCss', function(){
  return gulp.src(cssSrc)
    .pipe(rev())
    .pipe(revCollector())
    .pipe(gulp.dest(revmiddlefile+'/static/css'))
    .pipe(rev.manifest())
    .pipe(gulp.dest('./rev/css'));
});
// 处理图片
gulp.task('revImg', function(){
    return gulp.src(imgSrc)
        .pipe(rev())
        .pipe(gulp.dest(revmiddlefile+'/static/images'))
        .pipe(rev.manifest())
        .pipe(gulp.dest('./rev/images'));
});
// js生成文件hash编码并生成 rev-manifest.json文件名对照映射
gulp.task('revJs', function(){
  // gulp.src(['./rev/css/*.json', jsSrc])
  return gulp.src(jsSrc)
    .pipe(rev())
    .pipe(gulp.dest(revmiddlefile+'/static/js'))
    .pipe(rev.manifest())
    .pipe(gulp.dest('./rev/js'));
});
// Html替换css、js文件版本
gulp.task('revHtml', function () {
  return gulp.src(['./rev/**/*.json', './dist/**/*.html'])
    .pipe(revCollector())
    .pipe(gulp.dest(revmiddlefile));
});


// 文件添加hash后缀名构建
gulp.task('rev', function (done) {
  // condition = false;
  runSequence(
    ['revImg'],
    ['revCss'],
    ['revJs'],
    ['revHtml'],
    done);
});

gulp.task('sprites', spritesArr);

gulp.task('html', () => {
  return gulp.src(config.dev.html)
    .pipe(plumber(onError))
    .pipe(fileinclude({
      prefix: '@@',
      basepath: respath('src/include/')
    }))
    .pipe(gulpif(condition, htmlmin({
      removeComments: true,
      collapseWhitespace: true,
      minifyJS: true,
      minifyCSS: true
    })))
    .pipe(gulp.dest(config.build.html))
})

gulp.task('styles', () => {
  return gulp.src(config.dev.styles)
    .pipe(plumber(onError))
    .pipe(sass())
    .pipe(gulpif(condition, cleanCSS({debug: true})))
    .pipe(postcss('./.postcssrc.js'))
    .pipe(gulp.dest(config.build.styles))
})

gulp.task('images', () => {
  return gulp.src(config.dev.images)
    .pipe(plumber(onError))
    .pipe(cache(imagemin({
      progressive: true, // 无损压缩JPG图片
      svgoPlugins: [{removeViewBox: false}], // 不移除svg的viewbox属性
      use: [pngquant()] // 使用pngquant插件进行深度压缩
    })))
    .pipe(gulp.dest(config.build.images))
})

gulp.task('eslint', () => {
  return gulp.src(config.dev.script)
   .pipe(plumber(onError))
   .pipe(gulpif(condition, stripDebug()))
   .pipe(eslint({ configFle: './.eslintrc' }))
   .pipe(eslint.format())
   .pipe(eslint.failAfterError());
})


const useEslint = config.useEslint ? ['eslint'] : [];
gulp.task('script', useEslint, () => {
  return gulp.src(config.dev.script)
    .pipe(plumber(onError))
    .pipe(gulpif(condition, babel({
      presets: ['env']
    })))
    .pipe(gulpif(config.useWebpack, webpackStream(webpackConfig, webpack)))
    .pipe(gulpif(condition, uglify()))
    .pipe(gulp.dest(config.build.script))
})

gulp.task('static', () => {
  return gulp.src(config.dev.static)
    .pipe(gulp.dest(config.build.static))
})

gulp.task('clean', () => {
  del('./dist').then(paths => {
    console.log('Deleted files and folders:\n', paths.join('\n'));
  });
})

gulp.task('watch', () => {
  gulp.watch(config.dev.allhtml, ['html']).on('change', reload)
  gulp.watch(config.dev.styles, ['styles']).on('change', reload)
  gulp.watch(config.dev.script, ['script']).on('change', reload)
  gulp.watch(config.dev.images, ['images']).on('change', reload)
  gulp.watch(config.dev.static, ['static']).on('change', reload)
})

gulp.task('zip', () => {
  return gulp.src(config.zip.path)
  .pipe(plumber(onError))
  .pipe(zip(config.zip.name))
  .pipe(gulp.dest(config.zip.dest))
})


gulp.task('server', () => {
  const task = ['sprites', 'html', 'styles', 'script', 'images', 'static']
  cbTask(task).then(() => {
    browserSync.init(config.server)
    console.log(chalk.cyan('  Server complete.\n'))
    gulp.start('watch')
  })
})

gulp.task('build', () => {
  const task = ['html', 'styles', 'script', 'images', 'static']
  cbTask(task).then(() => {
    console.log(chalk.cyan('  Build complete.\n'))

    if (config.productionZip) {
      gulp.start('zip', () => {
        console.log(chalk.cyan('  Zip complete.\n'))
      })
    }

    if(config.revHash) {
      gulp.start('rev', () => {
        // console.log(chalk.cyan('  rev complete.\n'))
        console.log('rev complete');
        del(respath('dist')).then(() => {
          fs.rename(respath('revmiddlefile'), respath('dist'), () => {})
        });
      })
    }
  })
})

gulp.task('default', () => {
  console.log(chalk.green(
   `
  Build Setup
    开发环境： npm run dev
    生产环境： npm run build
    执行压缩： gulp zip
    编译页面： gulp html
    编译脚本： gulp script
    编译样式： gulp styles
    语法检测： gulp eslint
    压缩图片： gulp images
    `
  ))
})
