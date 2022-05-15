// Initialize Firebase
firebase.initializeApp(Config);


reset_password_btn.onclick = function() { reset_password(); }
back_to_login_page.onclick = function() { window.location.href="index.html";  }


// Function to send Password Reset Email to user 
function reset_password()
{
    var email = document.getElementById("email_reset_password_section").value;

    // Check if email field is blank
    if(email == "") { display_error("Email cannot be blank"); return false; }

    start_loading();

    firebase.auth().sendPasswordResetEmail(email).then(function() 
    { 
      stop_loading();
      display_info("Please check your email for further instuctions to reset your password"); 
    })

    .catch(function(error) 
    { 
      stop_loading();
      display_error("Failed. Please try again later"); return false; 
    })
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
function start_loading()
{
  $("#loadingModal").modal();
}

//Function to stop loading modal
function stop_loading()
{
  $("#loadingModal").modal("hide");
}