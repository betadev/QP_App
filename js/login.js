// Initialize Firebase
firebase.initializeApp(Config);

// Check if app installed or mobile web before showing installation prompt
if (!navigator.standalone && !window.matchMedia('(display-mode: standalone)').matches)
document.getElementById("app_install_alert").style.display = "block";


// On close app install button click
close_app_instruction_btn.onclick = function()
{
  document.getElementById("main_body").className = "bg-gradient-primary";
  document.getElementById("app_install_instruction_section").style.display = "none";
  document.getElementById("main_login_section").style.display = "block";
}

// On app install button click
install_app_btn.onclick = function()
{
//  document.getElementById("main_body").className = "bg-white";  
  document.getElementById("main_login_section").style.display = "none";
  document.getElementById("app_install_instruction_section").style.display = "block";
}


login_btn.onclick = function() { sign_in_user(); }
reset_btn.onclick = function() { window.location.href = "reset_password.html"; }

// Listen for changes in user auth state & send to app
firebase.auth().onAuthStateChanged(async function(user) {
  
  if (user && user.emailVerified == true) 
  window.location.href = "app.html";

  else if (user && user.emailVerified == false) 
  sign_out_user();
});



// Function to sign in user
async function sign_in_user()
{
    var email = document.getElementById("email_login_section").value;
    var pass = document.getElementById("password_login_section").value

    // Check if email / password field is blank
    if(email == "" || pass == "") {   display_error("Email / Password cannot be blank");    return false;   }

    start_loading();
    try
    {
      let res = await firebase.auth().signInWithEmailAndPassword(email, pass); 
    }

  catch(error) 
    {   
        stop_loading();
        display_error(error.message);
        return false;
    }

}


// Function to sign out user
async function sign_out_user() 
{ 
await firebase.auth().signOut(); 
window.location.href = "index.html";
}


// Function to display an error Modal with message
function display_error(error_message)
{
   document.getElementById("error_modal_message").innerHTML = error_message;
   $("#errorModal").modal();    
}

// Function to display an info Modal with message
function display_info(info_message)
{
  document.getElementById("info_modal_message").innerHTML = info_message;
  $("#infoModal").modal();    
}


//Function to display loading modal

// FLAG - start_loading_ver
var flag_start_loading_ver;              // Flag to track execution version
const gl_loading_dismiss_time = 12; // 12 seconds before loading dismiss message appears if taking too long
function start_loading()
{
  flag_start_loading_ver = new Date;
  flag_start_loading_ver.setSeconds(flag_start_loading_ver.getSeconds() + gl_loading_dismiss_time - 1);

  document.getElementById("loading_modal_footer").style.display = "none";
  $("#loadingModal").modal();

  // Show dismiss message & button if current time greater than (last function runtime + loading dismiss time) calculated
  setTimeout(function() {if(new Date >= flag_start_loading_ver) document.getElementById("loading_modal_footer").style.display = "block"}, gl_loading_dismiss_time*1000);

}

//Function to stop loading modal
function stop_loading()
{
  $("#loadingModal").modal("hide");
}