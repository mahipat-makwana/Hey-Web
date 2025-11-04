// src/components/Profile.jsx
import { useState } from 'react';
import './Profile.css';
import { Avatar, Button, TextField, IconButton, CircularProgress, Snackbar, Alert } from '@mui/material';
import PhotoCamera from '@mui/icons-material/PhotoCamera';
import { useStateValue } from '../StateProvider';
import { updateProfile } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { actionTypes } from '../reducer';


function Profile() {
  const [{ user }, dispatch] = useStateValue();
  const [name, setName] = useState(user?.displayName || '');
  const [isEditing, setIsEditing] = useState(false);
  // New state to track if the user has made changes
  const [isDirty, setIsDirty] = useState(false); 
  // Add state for image file and loading status
  const [] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
   // Add state for the Snackbar
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState('success');

  const handleSnackbarClose = (event, reason) => {
    if (reason === 'clickaway') {
      return;
    }
    setSnackbarOpen(false);
  };

  const handleNameChange = (e) => {
    setName(e.target.value);
    // If the user starts typing, mark the form as dirty
    if (e.target.value !== user?.displayName) {
      setIsDirty(true);
    }
  };

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsLoading(true);
    const storage = getStorage();
    const fileRef = storageRef(storage, `profile_images/${user.uid}`);

    try {
      // Upload the file
      await uploadBytes(fileRef, file);
      // Get the download URL
      const photoURL = await getDownloadURL(fileRef);

      // Update profile in Auth and Firestore
      await updateProfile(auth.currentUser, { photoURL });
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, { photoURL });

     const updatedUser = {
        ...user, // Copy existing user data
        photoURL: auth.currentUser.photoURL // Overwrite with the new photo URL
      };
      dispatch({ type: actionTypes.SET_USER, user: updatedUser });


      setSnackbarMessage("Profile picture updated successfully!");
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
    } catch (error) {
      setSnackbarMessage(`Error uploading image: ${error.message}`);
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    } finally {
      setIsLoading(false);
    }
  };

   const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (name.trim() === "") {
        setSnackbarMessage("Name cannot be empty.");
        setSnackbarSeverity('warning');
        setSnackbarOpen(true);
        return;
    }

    try {
      // Update the profile in Firebase Authentication
      await updateProfile(auth.currentUser, {
        displayName: name,
      });

      // Update the name in the 'users' collection in Firestore
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, {
        displayName: name,
        displayName_lowercase: name.toLowerCase()
      });

      const updatedUser = {
        ...user, // Copy existing user data
        displayName: name // Overwrite with the new name
      };
      dispatch({ type: actionTypes.SET_USER, user: updatedUser });

      setSnackbarMessage("Profile updated successfully!");
      setSnackbarSeverity('success');
      setSnackbarOpen(true);

      // Reset the states after saving
      setIsEditing(false);
      setIsDirty(false); 
    } catch (error) {
      setSnackbarMessage(`Error updating profile: ${error.message}`);
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  };

  return (
    <div className="profile">
      <div className="profile__container">
        <h1>Your Profile</h1>
        
        <div className="profile__avatarContainer">
          <Avatar src={user?.photoURL} sx={{ width: 100, height: 100 }} />
          {/* Show loading spinner over the avatar when uploading */}
          {isLoading && (
            <div className="profile__avatarLoading">
              <CircularProgress />
            </div>
          )}
          <input 
            type="file" 
            id="fileInput" 
            accept="image/*"
            onChange={handleImageChange}
            style={{ display: 'none' }} 
            disabled={isLoading} // Disable input while uploading
          />
          <label htmlFor="fileInput" className="profile__avatarEditButton">
            <IconButton component="span" disabled={isLoading}>
              <PhotoCamera />
            </IconButton>
          </label>
        </div>

        <form onSubmit={handleUpdateProfile} className="profile__form">
          <TextField
            label="Full Name"
            variant="outlined"
            value={name}
            onChange={handleNameChange} // Use the new handler
            disabled={!isEditing}
            fullWidth
          />
          <TextField
            label="Email"
            variant="outlined"
            value={user?.email || ''}
            disabled // Email is not editable
            fullWidth
          />

          {/* Button Container */}
          <div className="profile__buttons">
            <Button 
              type="button" 
              variant="outlined" 
              onClick={() => setIsEditing(true)}
              disabled={isEditing} // Disable when in edit mode
            >
              Edit Profile
            </Button>
            <Button 
              type="submit" 
              variant="contained" 
              color="primary"
              disabled={!isDirty} // Disable until changes are made
            >
              Save Changes
            </Button>
          </div>
        </form>
      </div>
      <Snackbar 
        open={snackbarOpen} 
        autoHideDuration={4000} 
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleSnackbarClose} severity={snackbarSeverity} sx={{ width: '100%' }}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </div>
  );
}

export default Profile;