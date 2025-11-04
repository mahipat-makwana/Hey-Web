// src/components/Chat.jsx
import React from 'react';
import { useState, useEffect, useRef } from 'react';
import './Chat.css';
import { Avatar, IconButton } from '@mui/material';
import { SearchOutlined, AttachFile, MoreVert, InsertEmoticon, Mic, Cancel, Send } from '@mui/icons-material';
import { useParams } from 'react-router-dom';
import {
  doc,
  onSnapshot,
  collection,
  query,
  orderBy,
  addDoc,
  serverTimestamp,
  updateDoc,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db, rtdb } from '../firebase';
import { ref, onValue } from 'firebase/database';
import { useStateValue } from '../StateProvider';
import DateSeparator from './DateSeparator';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { CircularProgress } from '@mui/material';

function Chat() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [otherUser, setOtherUser] = useState(null);
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);
  const [{ user: currentUser }] = useStateValue();
  const { chatId } = useParams();
  const typingTimeoutRef = useRef(null);
  const messagesEndRef = useRef(null);
  const [otherUserStatus, setOtherUserStatus] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [fileToUpload, setFileToUpload] = useState(null);

  // 2. This function now ONLY creates a local preview
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFileToUpload(file);
      setImagePreviewUrl(URL.createObjectURL(file));
    }
  };
  
  // 3. This new function handles the ACTUAL UPLOAD
  const handleImageUpload = async () => {
    if (!fileToUpload) return;
    
    setIsUploading(true);
    const storage = getStorage();
    const fileRef = storageRef(storage, `chat_media/${chatId}/${Date.now()}_${fileToUpload.name}`);
    
    try {
      await uploadBytes(fileRef, fileToUpload);
      const mediaUrl = await getDownloadURL(fileRef);

      const messagesColRef = collection(db, 'chats', chatId, 'messages');
      await addDoc(messagesColRef, {
        name: currentUser.displayName,
        mediaUrl: mediaUrl,
        type: 'image',
        timestamp: serverTimestamp(),
      });

      const chatDocRef = doc(db, 'chats', chatId);
      await updateDoc(chatDocRef, {
        lastMessage: '📷 Image',
        lastUpdated: serverTimestamp(),
      });
    } catch (error) {
      alert(`Error uploading file: ${error.message}`);
    } finally {
      // Cleanup after upload
      setIsUploading(false);
      setFileToUpload(null);
      URL.revokeObjectURL(imagePreviewUrl); // Clean up memory
      setImagePreviewUrl(null);
    }
  };

  const cancelImagePreview = () => {
      URL.revokeObjectURL(imagePreviewUrl); // Clean up memory
      setImagePreviewUrl(null);
      setFileToUpload(null);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };


  useEffect(() => {
    const testButton = document.getElementById('ai-test-button');

    const handleTestClick = async () => {
      if (typeof chrome !== 'undefined' && chrome.ai && chrome.ai.translator) {
        console.log('AI Translator API found. Attempting to translate...');
        try {
          const result = await chrome.ai.translator.translate(
            'Hello, this is a test.',
            { targetLanguage: 'es' }
          );
          console.log('✅ Translation Successful!', result);
        } catch (error) {
          console.error('❌ AI Translation Failed:', error);
        }
      } else {
        alert('Built-in AI is not available. Make sure you are using Chrome Canary and have enabled the correct flags in chrome://flags');
      }
    };

    if (testButton) {
      testButton.addEventListener('click', handleTestClick);
    }

    return () => {
      if (testButton) {
        testButton.removeEventListener('click', handleTestClick);
      }
    };
  }, []);


  // Effect to fetch chat, user, and message data
  useEffect(() => {
    scrollToBottom();
  }, [messages, isOtherUserTyping]);

  useEffect(() => {
    let unsubscribeChat, unsubscribeMessages, unsubscribeUser, unsubscribeStatus;

    if (chatId && currentUser) {
      const chatDocRef = doc(db, 'chats', chatId);

      unsubscribeChat = onSnapshot(chatDocRef, (chatSnap) => {
        if (chatSnap.exists()) {
          const chatData = chatSnap.data();
          const otherUserId = chatData.users.find((uid) => uid !== currentUser.uid);

          if (chatData.typing && chatData.typing.includes(otherUserId)) {
            setIsOtherUserTyping(true);
          } else {
            setIsOtherUserTyping(false);
          }

          if (otherUserId) {
            // Get user details from Firestore
            const userDocRef = doc(db, 'users', otherUserId);
            unsubscribeUser = onSnapshot(userDocRef, (userSnap) => {
              if (userSnap.exists()) setOtherUser(userSnap.data());
            });

            // Get REAL-TIME status from Realtime Database
            const userStatusRef = ref(rtdb, '/status/' + otherUserId);
            unsubscribeStatus = onValue(userStatusRef, (snapshot) => {
              if (snapshot.exists()) {
                setOtherUserStatus(snapshot.val());
              } else {
                setOtherUserStatus(null);
              }
            });
          }
        }
      });

      const messagesColRef = collection(db, 'chats', chatId, 'messages');
      // THIS IS THE FIX: Changed messagesCol_ref to messagesColRef
      const q = query(messagesColRef, orderBy('timestamp', 'asc'));
      unsubscribeMessages = onSnapshot(q, (snapshot) => {
        setMessages(
          snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }))
        );
      });
    }

    return () => {
      if (unsubscribeChat) unsubscribeChat();
      if (unsubscribeMessages) unsubscribeMessages();
      if (unsubscribeUser) unsubscribeUser();
      if (unsubscribeStatus) unsubscribeStatus(); // Cleanup the new listener
    };
  }, [chatId, currentUser]);

  // Effect #1: Manages the typing status while the user types
  useEffect(() => {
    if (!chatId || !currentUser) return;
    const chatDocRef = doc(db, 'chats', chatId);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    if (input.trim() !== '') {
      updateDoc(chatDocRef, { typing: arrayUnion(currentUser.uid) });
      typingTimeoutRef.current = setTimeout(() => {
        updateDoc(chatDocRef, { typing: arrayRemove(currentUser.uid) });
      }, 2000);
    } else {
      updateDoc(chatDocRef, { typing: arrayRemove(currentUser.uid) });
    }
  }, [input, chatId, currentUser]);

  // Effect #2: Cleans up the typing status ONLY when the component unmounts
  useEffect(() => {
    if (!chatId || !currentUser) return;
    const chatDocRef = doc(db, 'chats', chatId);
    return () => {
      updateDoc(chatDocRef, {
        typing: arrayRemove(currentUser.uid),
      });
    };
  }, [chatId, currentUser]);


  const sendMessage = async (e) => {
    e.preventDefault();
    if (input.trim() === '') return;

    const chatDocRef = doc(db, 'chats', chatId);
    const messagesColRef = collection(db, 'chats', chatId, 'messages');

    await addDoc(messagesColRef, {
      message: input,
      name: currentUser.displayName,
      timestamp: serverTimestamp(),
    });

    await updateDoc(chatDocRef, {
      lastMessage: input,
      lastUpdated: serverTimestamp(),
      typing: arrayRemove(currentUser.uid),
    });

    setInput('');
  };

  return (
    <div className="chat">
      <div className="chat__header">
        <Avatar src={otherUser?.photoURL} />
        <div className="chat__headerInfo">
          <h3>{otherUser?.displayName}</h3>
          <p>
            {otherUserStatus?.state === 'online' ? 'online'
            // If offline, try to use the RTDB timestamp first
            : otherUserStatus?.last_changed
            ? `Last seen ${new Date(otherUserStatus.last_changed).toLocaleString()}`
            // If that fails, fall back to the Firestore timestamp
            : otherUser?.lastSeen?.toDate ? `Last seen ${new Date(otherUser.lastSeen.toDate()).toLocaleString()}`
            : 'offline'}
          </p>
        </div>
        <div className="chat__headerRight">
          <IconButton><SearchOutlined /></IconButton>
          <IconButton><MoreVert /></IconButton>
        </div>
      </div>
      <div className="chat__body">

    {messages.map((message) => {
    const currentMessageDate = message.timestamp?.toDate().toDateString();
    const prevMessageDate = messages[messages.indexOf(message) - 1]?.timestamp?.toDate().toDateString();
    const showDateSeparator = currentMessageDate !== prevMessageDate;

    return (
      <React.Fragment key={message.id}>
        {showDateSeparator && <DateSeparator date={message.timestamp} />}
        <p
          className={`chat__message ${
            message.name === currentUser.displayName && 'chat__receiver'
          }`}
        >
          {message.type === 'image' ? (
              <img src={message.mediaUrl} alt="Shared media" className="chat__image" />
              ) : ( message.message)}
          <span className="chat__timestamp">
            {message.timestamp
              ? new Date(message.timestamp.toDate()).toLocaleTimeString(
                  'en-US',
                  {
                    hour: 'numeric',
                    minute: 'numeric',
                    hour12: true,
                  }
                )
              : '...'}
          </span>
        </p>
      </React.Fragment>
    );
  })}

  {isOtherUserTyping && (
      <div className="chat__message">
            <div className="chat__typingIndicator">
                <span></span>
                <span></span>
                <span></span>
            </div>
      </div>
  )}

  <div ref={messagesEndRef} />
</div>
      <div className="chat__footer">
        {imagePreviewUrl ? (
          // PREVIEW VIEW
          <div className="chat__imagePreview">
            <IconButton onClick={cancelImagePreview}>
              <Cancel />
            </IconButton>
            <img src={imagePreviewUrl} alt="Preview" />
            <IconButton onClick={handleImageUpload} disabled={isUploading}>
              {isUploading ? <CircularProgress size={24} /> : <Send />}
            </IconButton>
          </div>
        ) : (
          // REGULAR INPUT VIEW
          <>
            <InsertEmoticon />
            <form onSubmit={sendMessage}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message"
                type="text"
              />
              <button type="submit">Send a message</button>
            </form>
            <input 
              type="file" 
              id="mediaFileInput"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <label htmlFor="mediaFileInput">
              <IconButton component="span">
                <AttachFile />
              </IconButton>
            </label>
            <Mic />
          </>
        )}
      </div>
    </div>
  );
}

export default Chat;